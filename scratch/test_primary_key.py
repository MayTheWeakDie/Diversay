import os
import json
import base64
import urllib.request
from config import get_settings

def test_nvidia_primary():
    settings = get_settings()
    key = settings.NVIDIA_API_KEY
    print(f"Primary NVIDIA key: {key[:15]}...")

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
                    {"type": "text", "text": "Reply with JSON: {\"status\": \"ok\"}"}
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 100,
        "stream": False
    }

    req = urllib.request.Request(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body)
            print("Response:", data["choices"][0]["message"]["content"])
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_nvidia_primary()
