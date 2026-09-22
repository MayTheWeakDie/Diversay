import base64
import json
import urllib.request
import urllib.error
from pathlib import Path

KEY1 = "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"
KEY2 = "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"
BASE_URL = "https://integrate.api.nvidia.com/v1"

img_path = Path("an example of the ocr_image.jpg")
with open(img_path, "rb") as f:
    img_bytes = f.read()

b64_img = base64.b64encode(img_bytes).decode("utf-8")
data_uri = f"data:image/jpeg;base64,{b64_img}"

prompt = "Extract customer_name and products as JSON from this image."

for name, key in [("Key 1 (Primary)", KEY1), ("Key 2 (Secondary)", KEY2)]:
    print(f"Testing {name}: {key[:15]}...")
    payload = {
        "model": "meta/llama-3.2-11b-vision-instruct",
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
        "max_tokens": 512,
        "stream": False
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"✅ {name} SUCCESS:")
            print(data["choices"][0]["message"]["content"][:200])
    except Exception as e:
        print(f"❌ {name} FAILED: {e}")
