import base64
import json
from pathlib import Path
import urllib.request
import urllib.error

NVIDIA_API_KEY = "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"
BASE_URL = "https://integrate.api.nvidia.com/v1"

img_path = Path("an example of the ocr_image.jpg")
with open(img_path, "rb") as f:
    img_bytes = f.read()

b64_img = base64.b64encode(img_bytes).decode("utf-8")
data_uri = f"data:image/jpeg;base64,{b64_img}"

prompt = """You are a precise document scanner for pharmacy distribution order sheets.
Extract the following fields from the image as JSON:
- customer_name (string)
- invoice_number (string)
- waybill_number (string)
- brand (string, e.g. DSL or DSLP)
- date (string)
- products (array of objects: [{"name": string, "quantity": integer}])

Return ONLY valid JSON matching this schema."""

models_to_test = [
    "meta/llama-3.2-11b-vision-instruct",
    "meta/llama-3.2-90b-vision-instruct",
    "microsoft/phi-3-vision-128k-instruct",
    "nvidia/neva-22b"
]

for model in models_to_test:
    print(f"\n--- Testing NVIDIA Vision Model: {model} ---")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": f'{prompt}\n\n<img src="{data_uri}" />' if "neva" in model else [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}}
                ]
            }
        ],
        "temperature": 0.2,
        "top_p": 0.95,
        "max_tokens": 2048,
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
        with urllib.request.urlopen(req, timeout=30) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            content = res_data["choices"][0]["message"]["content"]
            print(f"✅ SUCCESS WITH {model}:")
            print(content[:500])
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8")
        print(f"❌ HTTP Error {e.code} ({model}): {err_text[:300]}")
    except Exception as e:
        print(f"❌ Error ({model}): {e}")
