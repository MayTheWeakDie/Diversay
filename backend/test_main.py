import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import Base, get_db
from main import app
from models import User, UserRole, AuditLog, ActionType, NotificationAcknowledgment
from auth import create_access_token, hash_password

# Test database settings
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Override database dependency
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()



client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Seed a test user
    db = TestingSessionLocal()
    
    test_user = db.query(User).filter(User.email == "test@example.com").first()
    if not test_user:
        test_user = User(
            email="test@example.com",
            full_name="Test Operator",
            password_hash=hash_password("testpassword123"),
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        
        # Create a sample audit log
        sample_log = AuditLog(
            user_id=test_user.id,
            action=ActionType.CREATE,
            table_name="orders",
            record_id=99,
            details='{"action": "Initial creation of order", "state_snapshot": {"order_number": "ORD-TEST-001", "customer_name": "Test Customer"}}'
        )
        db.add(sample_log)
        db.commit()

    yield
    
    # Teardown
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test.db"):
        os.remove("./test.db")
    app.dependency_overrides.pop(get_db, None)


def get_auth_headers():
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "test@example.com").first()
    token = create_access_token({"sub": user.id})
    return {"Authorization": f"Bearer {token}"}


def test_health_check():
    """Verify backend health endpoint is functional."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_audit_logs():
    """Verify system-wide audit logs endpoint."""
    headers = get_auth_headers()
    response = client.get("/analytics/audit-logs", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["table_name"] == "orders"
    assert data[0]["record_id"] == 99
    assert "Test Operator" in data[0]["user_name"]


def test_notification_acknowledgment_workflow():
    """Verify full end-to-end notification acknowledgment flow in database."""
    headers = get_auth_headers()
    
    # 1. Initially should be empty
    response = client.get("/analytics/acknowledged", headers=headers)
    assert response.status_code == 200
    assert "delayed-99" not in response.json()
    
    # 2. Acknowledge a notification
    response = client.post(
        "/analytics/acknowledge",
        headers=headers,
        json={"notification_id": "delayed-99"}
    )
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    
    # 3. Retrieve acknowledged and confirm it is stored
    response = client.get("/analytics/acknowledged", headers=headers)
    assert response.status_code == 200
    assert "delayed-99" in response.json()
    
    # 4. Acknowledging again should be idempotent
    response = client.post(
        "/analytics/acknowledge",
        headers=headers,
        json={"notification_id": "delayed-99"}
    )
    assert response.status_code == 200
    
    # Confirm it is still acknowledged
    response = client.get("/analytics/acknowledged", headers=headers)
    assert response.status_code == 200
    assert len([x for x in response.json() if x == "delayed-99"]) == 1


def test_store_analytics_trending_by_range():
    """Verify store analytics returning top_products_by_range for timeframes."""
    from models import Store
    db = TestingSessionLocal()
    store = Store(name="Analytics Test Store", state="Lagos", city="Ikeja", is_central=True)
    db.add(store)
    db.commit()
    db.refresh(store)
    
    headers = get_auth_headers()
    response = client.get(f"/stores/{store.id}/analytics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "top_products_by_range" in data
    assert "1" in data["top_products_by_range"]
    assert "7" in data["top_products_by_range"]
    assert "30" in data["top_products_by_range"]
    assert "90" in data["top_products_by_range"]
    assert "all" in data["top_products_by_range"]


def test_global_analytics_top_products_total_orders():
    """Verify global analytics endpoint returns top_products with total_orders and total_quantity."""
    headers = get_auth_headers()
    response = client.get("/analytics/global", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "top_products" in data
    assert "summary" in data
    for prod in data["top_products"]:
        assert "product_name" in prod
        assert "total_quantity" in prod
        assert "total_orders" in prod
        assert "store_breakdown" in prod


def test_global_analytics_expense_value_trend_per_unit():
    """Verify global analytics returns expense_value_trend with both per-order and per-unit metrics."""
    headers = get_auth_headers()
    response = client.get("/analytics/global", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "expense_value_trend" in data
    for item in data["expense_value_trend"]:
        assert "month" in item
        assert "avg_expense_per_order" in item
        assert "avg_expense_per_unit" in item
        assert "total_expense" in item
        assert "total_orders" in item
        assert "total_units" in item


# ---------------------------------------------------------------------------
# AI assistant (/ai/ask) — slot-filling router.
# We monkeypatch the two Gemini wrappers (select_tool / narrate) so these run
# offline and deterministically; the deterministic executors run for real.
# ---------------------------------------------------------------------------
import routes.ai as ai_module
from datetime import datetime, timedelta
from models import Customer, Order


def _seed_delayed_order(order_number="DSL-TEST-0001"):
    """Seed one non-transfer order dispatched 10 days ago with no delivery.

    With the 48h SLA it is DELAYED live, even though the stored order_status
    column stays at its DRAFT default — which is exactly what we assert.
    """
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "test@example.com").first()
        customer = db.query(Customer).filter(Customer.name == "AI Test Customer").first()
        if not customer:
            customer = Customer(
                name="AI Test Customer", city="Jos", state="Plateau",
                contact_number="08030000000", email="aitest@example.com",
            )
            db.add(customer)
            db.commit()
            db.refresh(customer)
        order = db.query(Order).filter(Order.order_number == order_number).first()
        if not order:
            order = Order(
                order_number=order_number,
                customer_id=customer.id,
                created_by_id=user.id,
                dispatch_time=datetime.utcnow() - timedelta(days=10),
                driver_name="Akeem",
                vehicle_number="APP-483-EQ",
            )
            db.add(order)
            db.commit()
    finally:
        db.close()


def test_ai_requires_auth():
    """/ai/ask must reject unauthenticated requests."""
    resp = client.post("/ai/ask", json={"question": "How many orders?"})
    assert resp.status_code == 401


def test_ai_analytics_routes_to_query_analytics(monkeypatch):
    """Analytics questions run the deterministic executor and return a chart."""
    _seed_delayed_order("DSL-TEST-0001")
    monkeypatch.setattr(
        ai_module, "select_tool",
        lambda q: {"name": "query_analytics", "args": {"metric": "order_count", "group_by": "status"}},
    )
    monkeypatch.setattr(ai_module, "narrate", lambda question, tool, result: "There is 1 delayed order.")

    resp = client.post("/ai/ask", headers=get_auth_headers(), json={"question": "How many orders by status?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tool_used"] == "query_analytics"
    assert data["answerable"] is True
    assert data["chart"] is not None
    assert data["chart"]["chart_type"] == "donut"
    # The seeded order surfaces under its LIVE status, not the stored default.
    assert "Delayed" in [d["label"] for d in data["chart"]["data"]]
    assert data["answer"] == "There is 1 delayed order."


def test_ai_get_order_returns_live_status(monkeypatch):
    """get_order reports the freshly-computed status, not the stale column."""
    _seed_delayed_order("DSL-TEST-0002")
    monkeypatch.setattr(
        ai_module, "select_tool",
        lambda q: {"name": "get_order", "args": {"order_number": "DSL-TEST-0002"}},
    )
    monkeypatch.setattr(ai_module, "narrate", lambda question, tool, result: "stub")

    resp = client.post("/ai/ask", headers=get_auth_headers(), json={"question": "status of DSL-TEST-0002?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tool_used"] == "get_order"
    assert data["answerable"] is True
    assert data["data"][0]["order_number"] == "DSL-TEST-0002"
    assert data["data"][0]["status"] == "Delayed"  # live-computed


def test_ai_cannot_answer_refuses(monkeypatch):
    """Off-topic questions refuse without fabricating (and never narrate)."""
    def boom(*a, **k):
        raise AssertionError("narrate must not be called on cannot_answer")

    monkeypatch.setattr(
        ai_module, "select_tool",
        lambda q: {"name": "cannot_answer", "args": {"reason": "off-topic"}},
    )
    monkeypatch.setattr(ai_module, "narrate", boom)

    resp = client.post("/ai/ask", headers=get_auth_headers(), json={"question": "What's the weather in Lagos?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["answerable"] is False
    assert data["tool_used"] == "cannot_answer"
    assert data["chart"] is None



