import os
import requests
from pathlib import Path

BASE_URL = "http://localhost:8000"

def test_backend_vision():
    # 1. Create a scan session
    create_res = requests.post(f"{BASE_URL}/scan-sessions/")
    print("Create Session Status:", create_res.status_code)
    session_info = create_res.json()
    print("Session Info:", session_info)
    session_id = session_info["session_id"]
    session_secret = session_info["session_secret"]

    # 2. Upload image to process-image endpoint
    img_path = Path(__file__).resolve().parents[1] / "an example of the ocr_image.jpg"
    print("Uploading image:", img_path)
    
    with open(img_path, "rb") as f:
        files = {"file": ("document.jpg", f, "image/jpeg")}
        data = {"session_secret": session_secret}
        upload_res = requests.post(f"{BASE_URL}/scan-sessions/{session_id}/process-image", files=files, data=data)
        
    print("Process Image Status:", upload_res.status_code)
    print("Process Image Response:\n", upload_res.text)

    # 3. Poll result endpoint
    poll_res = requests.get(f"{BASE_URL}/scan-sessions/{session_id}/result")
    print("\nPoll Result Status:", poll_res.status_code)
    print("Poll Result Response:\n", poll_res.text)

if __name__ == "__main__":
    test_backend_vision()
