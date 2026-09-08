import requests
import time

BASE_URL = "http://localhost:8000"

def test_ocr_flow():
    print("1. Creating scan session...")
    res = requests.post(f"{BASE_URL}/scan-sessions/")
    assert res.status_code == 201, f"Failed to create session: {res.text}"
    session_data = res.json()
    session_id = session_data["session_id"]
    session_secret = session_data["session_secret"]
    print(f"   Created session_id: {session_id}, session_secret: {session_secret}")

    print("2. Polling session before upload...")
    poll_res = requests.get(f"{BASE_URL}/scan-sessions/{session_id}/result")
    assert poll_res.status_code == 200
    assert poll_res.json()["status"] == "waiting"
    print("   Status is 'waiting' as expected.")

    print("3. Submitting OCR result payload...")
    mock_ocr = {
        "raw_text": "DIVERSAY SOLUTIONS LIMITED\nINVOICE: DSL/SA/999\nCUSTOMER: FOL-HOPE FARMS\nPRODUCTS: DIVERSAY 50G - 10 BAGS",
        "invoice_number": "DSL/SA/999",
        "customer_name": "FOL-HOPE FARMS",
        "products": [
            {"name": "DIVERSAY 50G", "qty_bags": 10, "unit_price": 5000}
        ]
    }
    submit_res = requests.post(
        f"{BASE_URL}/scan-sessions/{session_id}/result",
        json={"session_secret": session_secret, "extracted_data": mock_ocr}
    )
    assert submit_res.status_code == 200, f"Failed to submit: {submit_res.text}"
    print("   Submit success message:", submit_res.json()["message"])

    print("4. Polling session after upload...")
    poll_res2 = requests.get(f"{BASE_URL}/scan-sessions/{session_id}/result")
    assert poll_res2.status_code == 200
    poll_data = poll_res2.json()
    assert poll_data["status"] == "completed"
    assert poll_data["data"]["customer_name"] == "FOL-HOPE FARMS"
    assert poll_data["data"]["products"][0]["name"] == "DIVERSAY 50G"
    print("   Poll returned 'completed' with accurate data!")
    print("   E2E SCAN SESSION VERIFICATION SUCCESSFUL!")

if __name__ == "__main__":
    test_ocr_flow()
