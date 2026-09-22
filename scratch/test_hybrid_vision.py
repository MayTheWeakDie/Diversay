import json
import re
import base64
import urllib.request
import urllib.error
from pathlib import Path

NVIDIA_API_KEY = "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"
BASE_URL = "https://integrate.api.nvidia.com/v1"

def clean_json_response(raw_text: str) -> dict:
    """Strip markdown codeblock wrappers and parse JSON."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\n?", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    
    # Try finding first { and last }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start:end+1]
        
    return json.loads(cleaned)

def process_with_nvidia(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    b64_img = base64.b64encode(image_bytes).decode("utf-8")
    safe_mime = mime_type if mime_type in ["image/jpeg", "image/jpg", "image/png", "image/webp"] else "image/jpeg"
    data_uri = f"data:{safe_mime};base64,{b64_img}"

    prompt = """You are an expert document scanner AI for a commercial logistics and distribution company in Nigeria (Diversay Solutions Limited / DSL / DSLP).
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

Return ONLY valid JSON matching this schema, with no markdown wrappers or extra text."""

    models = [
        "meta/llama-3.2-11b-vision-instruct",
        "meta/llama-3.2-90b-vision-instruct"
    ]

    for model in models:
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}}
                    ]
                }
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "stream": False
        }

        headers = {
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
            "Content-Type": "application/json"
        }

        req = urllib.request.Request(
            f"{BASE_URL}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )

        try:
            print(f"[NVIDIA VISION] Trying model: {model}")
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                raw_text = resp_data["choices"][0]["message"]["content"]
                result = clean_json_response(raw_text)
                print(f"[NVIDIA VISION] Success with model: {model}")
                return result
        except Exception as e:
            print(f"[NVIDIA VISION] {model} failed: {e}")

    raise RuntimeError("All NVIDIA vision models failed")

if __name__ == "__main__":
    img_path = Path("an example of the ocr_image.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    res = process_with_nvidia(img_bytes)
    print("Parsed Result:")
    print(json.dumps(res, indent=2))
