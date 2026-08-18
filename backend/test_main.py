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


