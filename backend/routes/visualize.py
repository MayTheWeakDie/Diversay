from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, case
from database import get_db
from models import User, Order, OrderLineItem, Customer, Product, OrderStatus
from auth import get_current_user
from utils import calculate_order_status
from routes.global_analytics import _is_transfer, _compute_order_revenue
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import Optional, List
import json
import os

router = APIRouter(prefix="/analytics", tags=["analytics-ai"])

# ---------------------------------------------------------------------------
# Load the fixed vocabulary schema
# ---------------------------------------------------------------------------
# NOTE: the JSON lives in backend/ (the parent of routes/), so we walk one
# directory up from __file__.
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "visualization_schema.json")

with open(SCHEMA_PATH, "r") as f:
    VIZ_SCHEMA = json.load(f)

VALID_METRICS   = {m["id"] for m in VIZ_SCHEMA["metrics"]}
VALID_GROUPS    = {g["id"] for g in VIZ_SCHEMA["group_by"]}
VALID_FILTERS   = {f["id"] for f in VIZ_SCHEMA["filters"]}
VALID_TIME      = {t["id"] for t in VIZ_SCHEMA["time_ranges"]}
VALID_SORT      = set(VIZ_SCHEMA["sort_options"])
VALID_LIMITS    = set(VIZ_SCHEMA["limit_options"])

GROUP_TO_CHART  = {g["id"]: g["chart"] for g in VIZ_SCHEMA["group_by"]}

# ---------------------------------------------------------------------------
# Pydantic models for the request / response
# ---------------------------------------------------------------------------
class VisualizeFilter(BaseModel):
    id: str
    value: str

class VisualizeRequest(BaseModel):
    metric: str
    group_by: str
    time_range: str = "last_30_days"
    filters: List[VisualizeFilter] = []
    sort: str = "desc"
    limit: int = 10
    chart_type: Optional[str] = None   # auto-inferred if missing
    title: Optional[str] = None
    subtitle: Optional[str] = None

class ChartDataPoint(BaseModel):
    label: str
    value: float

class VisualizeResponse(BaseModel):
    chart_type: str
    title: str
    subtitle: str
    data: List[ChartDataPoint]

# ---------------------------------------------------------------------------
# Schema endpoint – the LLM reads this to know what it can pick
# ---------------------------------------------------------------------------
@router.get("/schema")
def get_visualization_schema():
    """Return the visualization schema so the LLM knows the fixed vocabulary."""
    return VIZ_SCHEMA

# ---------------------------------------------------------------------------
# Main visualization endpoint
# ---------------------------------------------------------------------------
@router.post("/visualize", response_model=VisualizeResponse)
def visualize(
    req: VisualizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deterministic visualization endpoint.
    Accepts a structured JSON with slots filled from the schema vocabulary.
    Validates every field, queries the database, returns [{label, value}].
    """
    return execute_structured_query(req, db)


def execute_structured_query(req: VisualizeRequest, db: Session) -> VisualizeResponse:
    """
    Core deterministic executor shared by the /visualize endpoint and the AI
    assistant (routes/ai.py).

    It validates every slot against the fixed schema vocabulary, queries the
    database reusing vetted helpers, recomputes *live* order status (the stored
    ``order_status`` column is stale), excludes inter-store transfers from
    customer/sales analytics, and returns chart-ready ``{label, value}`` data.

    The LLM never writes SQL and never sees rows — it only fills these
    validated slots, so answers cannot be hallucinated.
    """

    # ---- 1. VALIDATE every slot against the schema ----
    if req.metric not in VALID_METRICS:
        raise HTTPException(400, f"Invalid metric '{req.metric}'. Must be one of: {VALID_METRICS}")
    if req.group_by not in VALID_GROUPS:
        raise HTTPException(400, f"Invalid group_by '{req.group_by}'. Must be one of: {VALID_GROUPS}")
    if req.time_range not in VALID_TIME:
        raise HTTPException(400, f"Invalid time_range '{req.time_range}'. Must be one of: {VALID_TIME}")
    if req.sort not in VALID_SORT:
        raise HTTPException(400, f"Invalid sort '{req.sort}'. Must be 'asc' or 'desc'.")
    if req.limit not in VALID_LIMITS:
        # Snap to nearest valid
        req.limit = min(VALID_LIMITS, key=lambda x: abs(x - req.limit))
    for f in req.filters:
        if f.id not in VALID_FILTERS:
            raise HTTPException(400, f"Invalid filter '{f.id}'. Must be one of: {VALID_FILTERS}")

    # ---- 2. Compute time window ----
    now = datetime.utcnow()
    time_start = None
    if req.time_range == "last_7_days":
        time_start = now - timedelta(days=7)
    elif req.time_range == "last_30_days":
        time_start = now - timedelta(days=30)
    elif req.time_range == "last_90_days":
        time_start = now - timedelta(days=90)
    elif req.time_range == "this_year":
        time_start = datetime(now.year, 1, 1)
    # all_time → time_start stays None

    # ---- 3. Base query (orders with eager loads) ----
    orders_query = db.query(Order).filter(Order.is_deleted == False).options(
        joinedload(Order.customer),
        joinedload(Order.line_items).joinedload(OrderLineItem.product),
    )

    if time_start:
        orders_query = orders_query.filter(Order.dispatch_time >= time_start)

    # ---- 4. Apply filters (status is deferred: the DB column is stale) ----
    for f in req.filters:
        if f.id == "status":
            continue  # handled after live-status recompute below
        elif f.id == "state":
            orders_query = orders_query.join(Customer, Order.customer_id == Customer.id).filter(
                func.upper(Customer.state) == f.value.upper()
            )
        elif f.id == "customer":
            orders_query = orders_query.join(Customer, Order.customer_id == Customer.id).filter(
                Customer.name.ilike(f"%{f.value}%")
            )
        elif f.id == "product":
            orders_query = orders_query.join(OrderLineItem, Order.id == OrderLineItem.order_id).join(
                Product, OrderLineItem.product_id == Product.id
            ).filter(Product.name.ilike(f"%{f.value}%"))

    orders = orders_query.all()

    # Exclude inter-store transfers from customer/sales analytics
    # (mirrors the main dashboard in analytics.py).
    orders = [o for o in orders if not _is_transfer(o)]

    # Recompute live statuses (the stored order_status column is stale).
    for order in orders:
        order.order_status = calculate_order_status(order)

    # Apply the status filter against the freshly-computed live status.
    status_filter = next((f.value for f in req.filters if f.id == "status"), None)
    if status_filter:
        orders = [o for o in orders if o.order_status.value == status_filter]

    # ---- 5. GROUP BY + METRIC calculation ----
    data_points = _compute_grouped_metric(orders, req.metric, req.group_by, db)

    # ---- 6. Sort + Limit ----
    reverse = req.sort == "desc"
    # For time-based groupings, sort by label (chronologically) instead of value
    if req.group_by in ("day", "week", "month"):
        data_points.sort(key=lambda dp: dp["label"], reverse=reverse)
    else:
        data_points.sort(key=lambda dp: dp["value"], reverse=reverse)

    data_points = data_points[:req.limit]

    # ---- 7. Infer chart type ----
    chart_type = req.chart_type or GROUP_TO_CHART.get(req.group_by, "bar")

    # ---- 8. Build response ----
    metric_label = next((m["label"] for m in VIZ_SCHEMA["metrics"] if m["id"] == req.metric), req.metric)
    group_label  = next((g["label"] for g in VIZ_SCHEMA["group_by"] if g["id"] == req.group_by), req.group_by)
    time_label   = next((t["label"] for t in VIZ_SCHEMA["time_ranges"] if t["id"] == req.time_range), req.time_range)

    title    = req.title or f"{metric_label} by {group_label}"
    subtitle = req.subtitle or time_label

    return VisualizeResponse(
        chart_type=chart_type,
        title=title,
        subtitle=subtitle,
        data=[ChartDataPoint(label=dp["label"], value=dp["value"]) for dp in data_points],
    )


# ---------------------------------------------------------------------------
# Internal: compute metric for each group
# ---------------------------------------------------------------------------
def _compute_grouped_metric(orders, metric, group_by, db):
    """
    Given a list of Order ORM objects, group them and compute the requested metric.
    Returns a list of {"label": str, "value": float}.
    """
    from collections import defaultdict

    buckets = defaultdict(list)  # group_key → [orders]

    for order in orders:
        key = _get_group_key(order, group_by)
        if key is not None:
            # For product grouping, an order can appear in multiple buckets
            if isinstance(key, list):
                for k in key:
                    buckets[k].append(order)
            else:
                buckets[key].append(order)

    results = []
    for label, group_orders in buckets.items():
        value = _calculate_metric(group_orders, metric)
        results.append({"label": str(label), "value": value})

    return results


def _get_group_key(order, group_by):
    """Extract the group key from an order."""
    if group_by == "day":
        if order.dispatch_time:
            return order.dispatch_time.strftime("%Y-%m-%d")
    elif group_by == "week":
        if order.dispatch_time:
            # ISO week: e.g. "2026-W25"
            return order.dispatch_time.strftime("%Y-W%V")
    elif group_by == "month":
        if order.dispatch_time:
            return order.dispatch_time.strftime("%Y-%m")
    elif group_by == "customer":
        return order.customer.name if order.customer else "Unknown"
    elif group_by == "state":
        return (order.customer.state or "Unknown").upper() if order.customer else "Unknown"
    elif group_by == "driver":
        return order.driver_name or "Unassigned"
    elif group_by == "status":
        return order.order_status.value if order.order_status else "Unknown"
    elif group_by == "product":
        # An order can have multiple products → return list of keys
        if order.line_items:
            return [item.product.name for item in order.line_items if item.product]
        return None
    return None


def _calculate_metric(group_orders, metric):
    """Calculate a single metric value for a group of orders."""
    if metric == "order_count":
        return len(group_orders)

    elif metric == "total_revenue":
        # Reuse the vetted revenue helper, which falls back to product.unit_price
        # when a line item's unit_price is 0/None (the stored value is unreliable).
        total = sum(_compute_order_revenue(o) for o in group_orders)


        return round(total, 2)

    elif metric == "avg_delivery_hours":
        durations = []
        for o in group_orders:
            if o.dispatch_time and o.actual_delivery_time:
                delta = (o.actual_delivery_time - o.dispatch_time).total_seconds() / 3600
                durations.append(delta)
        return round(sum(durations) / len(durations), 1) if durations else 0

    elif metric == "delayed_count":
        return len([o for o in group_orders if o.order_status == OrderStatus.DELAYED])

    elif metric == "on_time_rate":
        on_time = len([o for o in group_orders if o.order_status == OrderStatus.DELIVERED_ON_TIME])
        late    = len([o for o in group_orders if o.order_status == OrderStatus.DELIVERED_LATE])
        total   = on_time + late
        return round((on_time / total) * 100, 1) if total > 0 else 0

    elif metric == "total_quantity":
        total = 0.0
        for o in group_orders:
            for item in o.line_items:
                total += item.quantity
        return round(total, 2)

    return 0
