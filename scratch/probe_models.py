"""
Probe every available flash model against a real image to find which ones actually work.
"""
import os, json, base64, urllib.request, urllib.error
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
API_KEY = os.getenv("GEMINI_API_KEY")
IMG_PATH = Path(__file__).resolve().parents[1] / "IMG_20260901_123504.jpg"

image_b64 = base64.b64encode(IMG_PATH.read_bytes()).decode()

prompt = 'Extract the invoice number from this image. Return ONLY a JSON object: {"invoice_number": "string"}'

MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
]

payload = json.dumps({
    "contents": [{"parts": [
        {"text": prompt},
        {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}}
    ]}],
    "generationConfig": {"response_mime_type": "application/json"}
}).encode()

results = []
for model in MODELS:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
            text = body["candidates"][0]["content"]["parts"][0]["text"]
            results.append((model, "✅ WORKS", text.strip()[:60]))
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:120]
        results.append((model, f"❌ HTTP {e.code}", msg))
    except Exception as e:
        results.append((model, f"❌ ERR", str(e)[:80]))

print(f"\n{'MODEL':<35} {'STATUS':<15} DETAIL")
print("-" * 100)
for model, status, detail in results:
    print(f"{model:<35} {status:<15} {detail}")
