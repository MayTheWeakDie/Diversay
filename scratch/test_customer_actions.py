import requests

BASE_URL = "http://localhost:8000"

def test_customers_flow():
    # Login
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "diversaysolutions@gmail.com",
        "password": "diversaysolutions@2025"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("🔑 Authenticated successfully.")

    endpoints = [
        ("GET", "/analytics/dashboard"),
        ("GET", "/customers/?limit=15"),
        ("GET", "/customers/search?q=VET"),
        ("GET", "/analytics/audit-logs"),
        ("POST", "/analytics/visualize")
    ]

    print("\n--- Verifying Customer Backend APIs ---")
    for item in endpoints:
        method = item[0]
        path = item[1]
        if method == "GET":
            res = requests.get(f"{BASE_URL}{path}", headers=headers)
        else:
            res = requests.post(f"{BASE_URL}{path}", json={"metric": "order_count", "group_by": "customer", "time_range": "last_30_days"}, headers=headers)
        
        print(f"[{method} {path}] Status: {res.status_code}")
        if res.status_code != 200:
            print("  ERR:", res.text[:200])

if __name__ == "__main__":
    test_customers_flow()
