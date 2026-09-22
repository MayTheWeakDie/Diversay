import os
import base64
import json
import requests
from dotenv import load_dotenv
from pathlib import Path

root_env = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=root_env)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

img_path = Path(__file__).resolve().parents[1] / "an example of the ocr_image.jpg"
if not img_path.exists():
    jpgs = list(Path(__file__).resolve().parents[1].glob("*.jpg"))
    if jpgs:
        img_path = jpgs[0]

print(f"Using image: {img_path}")

with open(img_path, "rb") as f:
    img_bytes = f.read()

base64_image = base64.b64encode(img_bytes).decode('utf-8')

models_to_try = ["gemini-3.6-flash", "gemini-3.5-flash"]

prompt = """
You are an expert document scanner AI for a commercial logistics and distribution company in Nigeria (Diversay Solutions Limited / DSL / DSLP).
Examine this invoice/waybill image carefully.
Extract the structured data into JSON with the following exact format:
{
  "customer_name": "string (full name of customer/store)",
  "invoice_number": "string (e.g. 10245 or DSL/SA/10245)",
  "waybill_number": "string (e.g. 8492 or DSL/DLN/8492)",
  "brand": "DSL or DSLP",
  "date": "YYYY-MM-DD or string as printed",
  "driver_name": "string if present",
  "vehicle_number": "string if present",
  "products": [
    {
      "name": "string (product description)",
      "quantity": 10
    }
  ]
}

Return ONLY valid JSON matching this schema, with no Markdown code block wrappers or extra text.
"""

for model in models_to_try:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64_image
                    }
                }
            ]
        }],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    }
    
    print(f"\n--- Testing model: {model} ---")
    try:
        res = requests.post(url, json=payload, timeout=30)
        print("Status Code:", res.status_code)
        if res.status_code == 200:
            res_data = res.json()
            text_resp = res_data['candidates'][0]['content']['parts'][0]['text']
            print("Response text:\n", text_resp)
            break
        else:
            print("Error response:", res.text[:300])
    except Exception as e:
        print("Exception:", e)
