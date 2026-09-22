import os
import json
import base64
import urllib.request
from config import get_settings

def test_image_vision():
    settings = get_settings()
    key = settings.NVIDIA_API_KEY
    print(f"Testing Primary NVIDIA key ({key[:15]}...) with real image...")

    image_path = "an example of the ocr_image.jpg"
    if not os.path.exists(image_path):
        print(f"File {image_path} not found!")
        return

    with open(image_path, "rb") as f:
        img_bytes = f.read()

    base64_image = base64.b64encode(img_bytes).decode("utf-8")
    data_uri = f"data:image/jpeg;base64,{base64_image}"

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "meta/llama-3.2-11b-vision-instruct",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract customer name and invoice number from this invoice in JSON format."},
                    {"type": "image_url", "image_url": {"url": data_uri}}
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 512,
        "stream": False
    }

    req = urllib.request.Request(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body)
            print("SUCCESS! Vision Model Output:")
            print(data["choices"][0]["message"]["content"])
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    test_image_vision()
