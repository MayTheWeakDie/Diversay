"""
Full end-to-end integration test against backend server using IMG_20260901_123504.jpg.
Tests:
1. Create scan session
2. Upload image to process-image endpoint (Gemini Vision)
3. Poll result endpoint
4. Verify extracted data matches shape expected by CreateOrderModal.applyScanDataToForm
"""
import os
import sys
import json
import requests
from pathlib import Path

BASE_URL = "http://localhost:8000"
IMG_PATH = Path(__file__).resolve().parents[1] / "IMG_20260901_123504.jpg"

REQUIRED_FIELDS_BY_FRONTEND = [
    "customer_name",
    "invoice_number",
    "waybill_number",
    "brand",
    "products",
]

def check_shape(data: dict) -> list[str]:
    """Check extracted JSON matches shape expected by applyScanDataToForm."""
    issues = []
    for field in REQUIRED_FIELDS_BY_FRONTEND:
        if field not in data:
            issues.append(f"MISSING field: '{field}'")
    products = data.get("products")
    if not isinstance(products, list):
        issues.append(f"'products' must be a list, got {type(products)}")
    elif len(products) == 0:
        issues.append("'products' list is empty — frontend won't fill any line items")
    else:
        for i, p in enumerate(products):
            if not isinstance(p, dict):
                issues.append(f"products[{i}] is not a dict")
                continue
            if "name" not in p:
                issues.append(f"products[{i}] missing 'name'")
            qty = p.get("quantity")
            if qty is None:
                issues.append(f"products[{i}] missing 'quantity'")
            elif not isinstance(qty, (int, float)) or qty <= 0:
                issues.append(f"products[{i}]['quantity'] is invalid: {qty}")
    return issues

def run():
    print(f"\n{'='*65}")
    print(f"E2E INTEGRATION TEST — IMG_20260901_123504.jpg")
    print(f"{'='*65}\n")

    assert IMG_PATH.exists(), f"Image not found: {IMG_PATH}"
    print(f"✔ Image found: {IMG_PATH.name} ({IMG_PATH.stat().st_size // 1024} KB)\n")

    # ── STEP 1: Create Scan Session ─────────────────────────────────
    print("STEP 1 — Creating scan session...")
    r = requests.post(f"{BASE_URL}/scan-sessions/")
    assert r.status_code == 201, f"Expected 201 got {r.status_code}: {r.text}"
    session = r.json()
    session_id = session["session_id"]
    session_secret = session["session_secret"]
    print(f"  ✔ Session ID: {session_id}")
    print(f"  ✔ Session Secret: {session_secret[:8]}...\n")

    # ── STEP 2: Poll — should be "waiting" ─────────────────────────
    print("STEP 2 — Polling (should be 'waiting')...")
    r = requests.get(f"{BASE_URL}/scan-sessions/{session_id}/result")
    assert r.status_code == 200
    assert r.json()["status"] == "waiting"
    print(f"  ✔ Status: waiting\n")

    # ── STEP 3: Upload Image to process-image endpoint ──────────────
    print("STEP 3 — Uploading image to /process-image (Gemini Vision)...")
    with open(IMG_PATH, "rb") as f:
        upload_r = requests.post(
            f"{BASE_URL}/scan-sessions/{session_id}/process-image",
            data={"session_secret": session_secret},
            files={"file": ("IMG_20260901_123504.jpg", f, "image/jpeg")},
            timeout=60
        )
    print(f"  Status Code: {upload_r.status_code}")
    assert upload_r.status_code == 200, f"Expected 200 got {upload_r.status_code}: {upload_r.text}"
    upload_data = upload_r.json()
    extracted = upload_data.get("extracted_data", {})
    print(f"  ✔ Gemini Vision processed successfully\n")

    # ── STEP 4: Print extracted data ─────────────────────────────────
    print("STEP 4 — Extracted Data from Gemini:")
    print(json.dumps(extracted, indent=2))

    # ── STEP 5: Poll — should now be "completed" ────────────────────
    print("\nSTEP 5 — Polling result (should be 'completed')...")
    r = requests.get(f"{BASE_URL}/scan-sessions/{session_id}/result")
    assert r.status_code == 200
    poll_data = r.json()
    assert poll_data["status"] == "completed", f"Expected 'completed', got: {poll_data['status']}"
    poll_extracted = poll_data["data"]
    assert poll_extracted == extracted, "Polled data does not match upload response data"
    print(f"  ✔ Status: completed")
    print(f"  ✔ Polled data matches upload response\n")

    # ── STEP 6: Validate shape for frontend ────────────────────────
    print("STEP 6 — Frontend shape validation (applyScanDataToForm):")
    issues = check_shape(extracted)
    if issues:
        print("  ⚠ Shape issues found:")
        for issue in issues:
            print(f"    - {issue}")
    else:
        print("  ✔ All required fields present and correctly typed")
        print(f"  ✔ customer_name  : {extracted.get('customer_name')}")
        print(f"  ✔ invoice_number : {extracted.get('invoice_number')}")
        print(f"  ✔ waybill_number : {extracted.get('waybill_number')}")
        print(f"  ✔ brand          : {extracted.get('brand')}")
        print(f"  ✔ date           : {extracted.get('date')}")
        print(f"  ✔ products       : {len(extracted.get('products', []))} line item(s)")
        for p in extracted.get("products", []):
            print(f"       - {p.get('name')} × {p.get('quantity')}")

    print(f"\n{'='*65}")
    print("E2E TEST COMPLETE" + (" — ALL CHECKS PASSED ✔" if not issues else " — WITH WARNINGS"))
    print(f"{'='*65}\n")

if __name__ == "__main__":
    run()
