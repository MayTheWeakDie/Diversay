import requests
import json

BASE_URL = "http://localhost:8000"

def test_action_calculations():
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "diversaysolutions@gmail.com",
        "password": "diversaysolutions@2025"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch orders
    res_data = requests.get(f"{BASE_URL}/orders", headers=headers).json()
    orders = res_data if isinstance(res_data, list) else res_data.get("items", [])
    print(f"📦 Successfully extracted {len(orders)} orders.")

    # 1. fetch_avg_costs_per_order
    count = len(orders) or 1
    total_fuel = sum(o.get("fuel_cost") or 0 for o in orders)
    total_waybill = sum(o.get("waybill_cost") or 0 for o in orders)
    total_other = sum(o.get("other_costs") or 0 for o in orders)
    avg_costs = {
        "total_orders_evaluated": len(orders),
        "average_fuel_cost_per_order": round(total_fuel / count, 2),
        "average_waybill_cost_per_order": round(total_waybill / count, 2),
        "average_other_cost_per_order": round(total_other / count, 2),
        "average_total_logistics_cost_per_order": round((total_fuel + total_waybill + total_other) / count, 2)
    }
    print("\n--- fetch_avg_costs_per_order ---")
    print(json.dumps(avg_costs, indent=2))

    # 2. fetch_order_costs_summary
    costs_summary = {
        "total_orders_evaluated": len(orders),
        "total_fuel_cost": round(total_fuel, 2),
        "total_waybill_cost": round(total_waybill, 2),
        "total_other_costs": round(total_other, 2),
        "total_logistics_expense": round(total_fuel + total_waybill + total_other, 2)
    }
    print("\n--- fetch_order_costs_summary ---")
    print(json.dumps(costs_summary, indent=2))

    # 3. fetch_avg_units_per_order
    total_units = 0
    total_line_items = 0
    for o in orders:
        items = o.get("line_items") or []
        total_line_items += len(items)
        for item in items:
            total_units += item.get("quantity") or 0
    avg_units = {
        "total_orders_evaluated": len(orders),
        "total_units_dispatched": total_units,
        "total_line_items": total_line_items,
        "average_units_per_order": round(total_units / count, 2),
        "average_line_items_per_order": round(total_line_items / count, 2)
    }
    print("\n--- fetch_avg_units_per_order ---")
    print(json.dumps(avg_units, indent=2))

if __name__ == "__main__":
    test_action_calculations()
