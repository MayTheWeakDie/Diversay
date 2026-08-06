from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import (
    User, Order, OrderLineItem, OrderReferenceCard, Customer,
    OrderStatus, Product, Store, StoreInventory
)
from auth import get_current_user
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict
import calendar

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _is_transfer(order: Order) -> bool:
    """Check if an order is an inter-store transfer."""
    if order.destination_store_id is not None:
        return True
    if order.customer and (
        "transfer" in order.customer.name.lower()
        or order.customer.name == "Inter-Store Transfer"
    ):
        return True
    return False


def _get_nigerian_season(month: int) -> str:
    """Map a calendar month to a Nigerian season.

    Rainy Season: April–October
    Harmattan: November–February (sub-season of Dry)
    Dry Season: November–March (overlap with Harmattan in Nov–Feb,
                                exclusive dry in March)
    """
    if 4 <= month <= 10:
        return "Rainy Season"
    elif month in (12, 1, 2):
        return "Harmattan"
    else:  # Nov, Mar
        return "Dry Season"


def _get_geopolitical_zone(customer: Customer) -> str:
    """Map a customer to a Nigerian geopolitical zone."""
    if not customer:
        return "Unknown"

    state = (customer.state or "").strip().lower()
    city = (customer.city or "").strip().lower()
    loc = f"{state} {city} {customer.address or ''}".lower()

    nw = ['kaduna', 'kano', 'katsina', 'kebbi', 'jigawa', 'sokoto', 'zamfara']
    ne = ['adamawa', 'bauchi', 'borno', 'gombe', 'taraba', 'yobe']
    nc = ['benue', 'kogi', 'kwara', 'nasarawa', 'niger', 'plateau', 'fct', 'abuja']
    sw = ['ekiti', 'lagos', 'ogun', 'ondo', 'osun', 'oyo']
    se = ['abia', 'anambra', 'ebonyi', 'enugu', 'imo']
    ss = ['akwa ibom', 'bayelsa', 'cross river', 'delta', 'edo', 'rivers']

    if any(x in loc for x in nw):
        return "North West"
    if any(x in loc for x in ne):
        return "North East"
    if any(x in loc for x in nc):
        return "Middle Belt"
    if any(x in loc for x in sw):
        return "South West"
    if any(x in loc for x in se):
        return "South East"
    if any(x in loc for x in ss):
        return "South South"

    return customer.state if customer.state and customer.state != "Unspecified State" else "Other"


def _compute_order_total_expense(order: Order) -> float:
    """Compute the total logistics expense for an order (fuel + waybill + other costs)."""
    total = (order.fuel_cost or 0.0) + (order.waybill_cost or 0.0)
    if order.other_costs:
        for cost_entry in order.other_costs:
            if isinstance(cost_entry, dict):
                total += float(cost_entry.get("amount", 0) or 0)
    return total


def _compute_order_revenue(order: Order) -> float:
    """Compute the total line item revenue for an order."""
    total = 0.0
    for item in order.line_items:
        price = item.unit_price or (item.product.unit_price if item.product else 0.0) or 0.0
        total += item.quantity * price
    return total


@router.get("/global")
def get_global_analytics(
    timeframe: str = Query("all", description="Filter: 'all', '7', '30', '90'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Comprehensive cross-store analytics endpoint.
    Aggregates order data across ALL stores, excluding inter-store transfers.
    """
    # ── Fetch all non-deleted orders with relationships ──
    all_orders_raw = db.query(Order).filter(
        Order.is_deleted == False
    ).options(
        joinedload(Order.line_items).joinedload(OrderLineItem.product),
        joinedload(Order.customer),
        joinedload(Order.source_store),
        joinedload(Order.destination_store),
    ).all()

    # ── Filter out inter-store transfers ──
    all_orders = [o for o in all_orders_raw if not _is_transfer(o)]

    # ── Apply timeframe filter ──
    now = datetime.utcnow()
    if timeframe != "all":
        try:
            max_days = float(timeframe)
        except ValueError:
            max_days = None

        if max_days:
            cutoff = now - timedelta(days=max_days)
            all_orders = [
                o for o in all_orders
                if (o.dispatch_time or o.created_at or now) >= cutoff
            ]

    if not all_orders:
        return _empty_response(timeframe)

    # ── Pre-compute per-order values ──
    order_data = []
    for o in all_orders:
        dispatch = o.dispatch_time or o.created_at or now
        expense = _compute_order_total_expense(o)
        revenue = _compute_order_revenue(o)
        zone = _get_geopolitical_zone(o.customer)
        month = dispatch.month
        year = dispatch.year
        season = _get_nigerian_season(month)
        weekday = dispatch.strftime("%A")  # Monday, Tuesday, ...
        source_name = o.source_store.name if o.source_store else "Unknown"

        order_data.append({
            "order": o,
            "dispatch": dispatch,
            "expense": expense,
            "revenue": revenue,
            "zone": zone,
            "month": month,
            "year": year,
            "year_month": f"{year}-{month:02d}",
            "season": season,
            "weekday": weekday,
            "source_store_name": source_name,
            "source_store_id": o.source_store_id,
        })

    # ═══════════════════════════════════════════════════
    # 1. TOP SELLING PRODUCTS (across all stores)
    # ═══════════════════════════════════════════════════
    product_qty = defaultdict(float)
    product_revenue = defaultdict(float)
    product_store_qty = defaultdict(lambda: defaultdict(float))
    product_category = {}
    product_brand = {}

    for od in order_data:
        for item in od["order"].line_items:
            pname = item.product.name if item.product else f"Product #{item.product_id}"
            price = item.unit_price or (item.product.unit_price if item.product else 0.0) or 0.0
            product_qty[pname] += item.quantity
            product_revenue[pname] += item.quantity * price
            product_store_qty[pname][od["source_store_name"]] += item.quantity
            if item.product:
                product_category[pname] = item.product.category.value if item.product.category else "Other"
                product_brand[pname] = (item.product.brand or "DSL").upper()

    top_products = sorted(product_qty.items(), key=lambda x: x[1], reverse=True)[:20]
    top_products_data = []
    for pname, qty in top_products:
        store_breakdown = [
            {"store": s, "quantity": q}
            for s, q in sorted(product_store_qty[pname].items(), key=lambda x: x[1], reverse=True)
        ]
        top_products_data.append({
            "product_name": pname,
            "total_quantity": qty,
            "total_revenue": round(product_revenue.get(pname, 0), 2),
            "category": product_category.get(pname, "Other"),
            "brand": product_brand.get(pname, "DSL"),
            "store_breakdown": store_breakdown
        })

    # ═══════════════════════════════════════════════════
    # 2. SEASONAL SALES PATTERNS (product × season)
    # ═══════════════════════════════════════════════════
    season_product_qty = defaultdict(lambda: defaultdict(float))
    month_product_qty = defaultdict(lambda: defaultdict(float))

    for od in order_data:
        for item in od["order"].line_items:
            pname = item.product.name if item.product else f"Product #{item.product_id}"
            season_product_qty[od["season"]][pname] += item.quantity
            month_name = calendar.month_abbr[od["month"]]
            month_product_qty[month_name][pname] += item.quantity

    # For scatter/bubble chart: each bubble = (product, season, quantity)
    seasonal_scatter = []
    top_product_names = [p[0] for p in top_products[:15]]
    for season in ["Rainy Season", "Harmattan", "Dry Season"]:
        for pname in top_product_names:
            qty = season_product_qty[season].get(pname, 0)
            if qty > 0:
                seasonal_scatter.append({
                    "product": pname,
                    "season": season,
                    "quantity": qty
                })

    # Monthly product breakdown for heatmap
    monthly_product_data = []
    for month_idx in range(1, 13):
        month_name = calendar.month_abbr[month_idx]
        for pname in top_product_names:
            qty = month_product_qty[month_name].get(pname, 0)
            if qty > 0:
                monthly_product_data.append({
                    "month": month_name,
                    "month_index": month_idx,
                    "product": pname,
                    "quantity": qty
                })

    # ═══════════════════════════════════════════════════
    # 3. MONTHLY ORDER VOLUME
    # ═══════════════════════════════════════════════════
    monthly_orders = defaultdict(int)
    monthly_revenue = defaultdict(float)

    for od in order_data:
        monthly_orders[od["year_month"]] += 1
        monthly_revenue[od["year_month"]] += od["revenue"]

    monthly_volume_data = [
        {
            "month": ym,
            "orders": monthly_orders[ym],
            "revenue": round(monthly_revenue[ym], 2)
        }
        for ym in sorted(monthly_orders.keys())
    ]

    # ═══════════════════════════════════════════════════
    # 4. PRODUCTS BY GEOPOLITICAL ZONE
    # ═══════════════════════════════════════════════════
    zone_product_qty = defaultdict(lambda: defaultdict(float))
    zone_order_count = defaultdict(int)

    for od in order_data:
        zone = od["zone"]
        zone_order_count[zone] += 1
        for item in od["order"].line_items:
            pname = item.product.name if item.product else f"Product #{item.product_id}"
            zone_product_qty[zone][pname] += item.quantity

    # Per zone: top products
    zone_data = []
    for zone in ["North West", "North East", "Middle Belt", "South West", "South East", "South South", "Other"]:
        if zone in zone_product_qty:
            products_in_zone = sorted(zone_product_qty[zone].items(), key=lambda x: x[1], reverse=True)[:10]
            zone_data.append({
                "zone": zone,
                "total_orders": zone_order_count.get(zone, 0),
                "total_quantity": sum(q for _, q in products_in_zone),
                "products": [{"product": p, "quantity": q} for p, q in products_in_zone]
            })

    # Stacked bar data: for each top product, show qty per zone
    zone_stacked_data = []
    zones_present = ["North West", "North East", "Middle Belt", "South West", "South East", "South South", "Other"]
    for pname in top_product_names[:10]:
        entry = {"product": pname}
        for zone in zones_present:
            entry[zone] = zone_product_qty[zone].get(pname, 0)
        zone_stacked_data.append(entry)

    # ═══════════════════════════════════════════════════
    # 5. TOTAL & AVERAGE ORDER EXPENSE
    # ═══════════════════════════════════════════════════
    total_expense = sum(od["expense"] for od in order_data)
    total_revenue_all = sum(od["revenue"] for od in order_data)
    avg_expense = total_expense / len(order_data) if order_data else 0
    avg_revenue = total_revenue_all / len(order_data) if order_data else 0

    # Expense breakdown pie
    total_fuel = sum((od["order"].fuel_cost or 0) for od in order_data)
    total_waybill = sum((od["order"].waybill_cost or 0) for od in order_data)
    total_other = total_expense - total_fuel - total_waybill

    expense_breakdown = [
        {"name": "Fuel Cost", "value": round(total_fuel, 2)},
        {"name": "Waybill Cost", "value": round(total_waybill, 2)},
        {"name": "Other Costs", "value": round(total_other, 2)},
    ]

    # ═══════════════════════════════════════════════════
    # 6. TOP CUSTOMERS BY ORDER EXPENSE
    # ═══════════════════════════════════════════════════
    customer_expense = defaultdict(lambda: {"name": "", "total_expense": 0.0, "order_count": 0, "state": "", "city": ""})

    for od in order_data:
        cust = od["order"].customer
        if cust:
            ckey = cust.name
            customer_expense[ckey]["name"] = cust.name
            customer_expense[ckey]["total_expense"] += od["expense"]
            customer_expense[ckey]["order_count"] += 1
            if cust.state and cust.state != "Unspecified State":
                customer_expense[ckey]["state"] = cust.state
            if cust.city:
                customer_expense[ckey]["city"] = cust.city

    top_customers_expense = sorted(
        customer_expense.values(),
        key=lambda x: x["total_expense"],
        reverse=True
    )[:15]
    for c in top_customers_expense:
        c["total_expense"] = round(c["total_expense"], 2)

    # ═══════════════════════════════════════════════════
    # 7. STORE WITH HIGHEST ORDERS
    # ═══════════════════════════════════════════════════
    store_order_count = defaultdict(lambda: {"name": "", "count": 0})

    for od in order_data:
        sid = od["source_store_id"]
        if sid:
            store_order_count[sid]["name"] = od["source_store_name"]
            store_order_count[sid]["count"] += 1

    store_orders_ranked = sorted(store_order_count.values(), key=lambda x: x["count"], reverse=True)

    # ═══════════════════════════════════════════════════
    # 8. STORE WITH HIGHEST OUTBOUND VOLUME
    # ═══════════════════════════════════════════════════
    store_volume = defaultdict(lambda: {"name": "", "total_quantity": 0.0, "total_revenue": 0.0})

    for od in order_data:
        sid = od["source_store_id"]
        if sid:
            store_volume[sid]["name"] = od["source_store_name"]
            for item in od["order"].line_items:
                store_volume[sid]["total_quantity"] += item.quantity
                price = item.unit_price or (item.product.unit_price if item.product else 0.0) or 0.0
                store_volume[sid]["total_revenue"] += item.quantity * price

    store_volume_ranked = sorted(store_volume.values(), key=lambda x: x["total_quantity"], reverse=True)
    for sv in store_volume_ranked:
        sv["total_revenue"] = round(sv["total_revenue"], 2)

    # ═══════════════════════════════════════════════════
    # 9. ORDERS BY PRODUCT CATEGORY
    # ═══════════════════════════════════════════════════
    category_revenue = defaultdict(float)
    category_qty = defaultdict(float)
    category_orders = defaultdict(set)

    for od in order_data:
        for item in od["order"].line_items:
            pname = item.product.name if item.product else f"Product #{item.product_id}"
            cat = product_category.get(pname, "Other")
            price = item.unit_price or (item.product.unit_price if item.product else 0.0) or 0.0
            category_revenue[cat] += item.quantity * price
            category_qty[cat] += item.quantity
            category_orders[cat].add(od["order"].id)

    category_data = [
        {
            "name": cat,
            "quantity": category_qty[cat],
            "orders": len(category_orders[cat]),
            "revenue": round(category_revenue[cat], 2)
        }
        for cat, q in sorted(category_qty.items(), key=lambda x: x[1], reverse=True)
    ]

    # ═══════════════════════════════════════════════════
    # 10. BRAND ORDER VOLUME COMPARISON (DSL vs DSLP)
    # ═══════════════════════════════════════════════════
    brand_revenue = defaultdict(float)
    brand_qty = defaultdict(float)
    brand_orders = defaultdict(dict)

    for od in order_data:
        for item in od["order"].line_items:
            pname = item.product.name if item.product else f"Product #{item.product_id}"
            brand_raw = (item.product.brand if item.product and item.product.brand else "DSL").upper()
            bkey = "DSLP" if ("DSLP" in brand_raw or "PACK" in brand_raw) else "DSL"
            price = item.unit_price or (item.product.unit_price if item.product else 0.0) or 0.0
            brand_revenue[bkey] += item.quantity * price
            brand_qty[bkey] += item.quantity
            
            oid = od["order"].id
            if oid not in brand_orders[bkey]:
                brand_orders[bkey][oid] = {
                    "id": oid,
                    "tracking_code": getattr(od["order"], "tracking_code", None) or f"ORD-{oid}",
                    "customer": od["order"].customer.name if od["order"].customer else "Walk-in Customer",
                    "store": od["source_store_name"],
                    "date": od["dispatch"].strftime("%Y-%m-%d"),
                    "quantity": 0,
                    "amount": 0.0
                }
            brand_orders[bkey][oid]["quantity"] += item.quantity
            brand_orders[bkey][oid]["amount"] += item.quantity * price

    for b in ["DSL", "DSLP"]:
        for o in brand_orders[b].values():
            o["amount"] = round(o["amount"], 2)

    brand_data = [
        {
            "name": "DSL",
            "quantity": brand_qty["DSL"],
            "orders": len(brand_orders["DSL"]),
            "revenue": round(brand_revenue["DSL"], 2),
            "order_list": list(brand_orders["DSL"].values())
        },
        {
            "name": "DSLP",
            "quantity": brand_qty["DSLP"],
            "orders": len(brand_orders["DSLP"]),
            "revenue": round(brand_revenue["DSLP"], 2),
            "order_list": list(brand_orders["DSLP"].values())
        }
    ]

    # ═══════════════════════════════════════════════════
    # 11. DAY-OF-WEEK DISTRIBUTION
    # ═══════════════════════════════════════════════════
    weekday_counts = defaultdict(int)
    for od in order_data:
        weekday_counts[od["weekday"]] += 1

    weekday_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    weekday_data = [
        {"day": day, "orders": weekday_counts.get(day, 0)}
        for day in weekday_order
    ]

    # ═══════════════════════════════════════════════════
    # 12. AVERAGE EXPENSE VALUE TREND (month over month)
    # ═══════════════════════════════════════════════════
    monthly_expense = defaultdict(float)
    for od in order_data:
        monthly_expense[od["year_month"]] += od["expense"]

    expense_value_trend = []
    for ym in sorted(monthly_orders.keys()):
        orders_cnt = monthly_orders[ym]
        tot_exp = monthly_expense[ym]
        avg_exp = tot_exp / orders_cnt if orders_cnt > 0 else 0.0
        expense_value_trend.append({
            "month": ym,
            "avg_expense": round(avg_exp, 2),
            "total_expense": round(tot_exp, 2),
            "total_orders": orders_cnt
        })

    # ═══════════════════════════════════════════════════
    # SUMMARY KPIs
    # ═══════════════════════════════════════════════════
    total_orders = len(order_data)
    total_units = sum(product_qty.values())
    unique_products = len(product_qty)
    unique_customers = len(set(
        od["order"].customer.name for od in order_data if od["order"].customer
    ))

    return {
        "timeframe": timeframe,
        "summary": {
            "total_orders": total_orders,
            "total_units_sold": round(total_units, 2),
            "total_revenue": round(total_revenue_all, 2),
            "total_expense": round(total_expense, 2),
            "avg_expense_per_order": round(avg_expense, 2),
            "avg_revenue_per_order": round(avg_revenue, 2),
            "unique_products": unique_products,
            "unique_customers": unique_customers,
        },
        "top_products": top_products_data,
        "seasonal_scatter": seasonal_scatter,
        "monthly_product_data": monthly_product_data,
        "monthly_volume": monthly_volume_data,
        "zone_data": zone_data,
        "zone_stacked": zone_stacked_data,
        "expense_breakdown": expense_breakdown,
        "top_customers_expense": top_customers_expense,
        "store_orders_ranked": store_orders_ranked,
        "store_volume_ranked": store_volume_ranked,
        "category_data": category_data,
        "brand_data": brand_data,
        "weekday_data": weekday_data,
        "order_value_trend": expense_value_trend,
        "expense_value_trend": expense_value_trend,
    }


def _empty_response(timeframe: str):
    """Return a valid but empty analytics response."""
    return {
        "timeframe": timeframe,
        "summary": {
            "total_orders": 0,
            "total_units_sold": 0,
            "total_revenue": 0,
            "total_expense": 0,
            "avg_expense_per_order": 0,
            "avg_revenue_per_order": 0,
            "unique_products": 0,
            "unique_customers": 0,
        },
        "top_products": [],
        "seasonal_scatter": [],
        "monthly_product_data": [],
        "monthly_volume": [],
        "zone_data": [],
        "zone_stacked": [],
        "expense_breakdown": [],
        "top_customers_expense": [],
        "store_orders_ranked": [],
        "store_volume_ranked": [],
        "category_data": [],
        "brand_data": [],
        "weekday_data": [],
        "order_value_trend": [],
    }
