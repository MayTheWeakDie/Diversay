import requests
import json

BASE_URL = "http://localhost:8000"

def run_tests():
    # Login to get token
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "diversaysolutions@gmail.com",
        "password": "diversaysolutions@2025"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("🔑 Authenticated successfully.")

    endpoints = [
        ("GET", "/analytics/low-stock"),
        ("GET", "/analytics/low-stock?count_only=true"),
        ("GET", "/products/?limit=100"),
        ("GET", "/stores/"),
        ("GET", "/analytics/audit-logs")
    ]

    print("\n--- Verifying Inventory Backend APIs ---")
    for method, path in endpoints:
        res = requests.get(f"{BASE_URL}{path}", headers=headers)
        print(f"[{method} {path}] Status: {res.status_code}")
        if res.status_code != 200:
            print("  ERR:", res.text[:200])

if __name__ == "__main__":
    run_tests()
