import json
import urllib.request
import urllib.error

NVIDIA_API_KEY = "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"
BASE_URL = "https://integrate.api.nvidia.com/v1"

headers = {
    "Authorization": f"Bearer {NVIDIA_API_KEY}",
    "Content-Type": "application/json"
}

req = urllib.request.Request(f"{BASE_URL}/models", headers=headers)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        models = [m["id"] for m in data.get("data", [])]
        print(f"Total models available on NVIDIA API: {len(models)}")
        vision_models = [m for m in models if any(k in m.lower() for k in ["vision", "vl", "neva", "multimodal", "ocr", "deplot", "paligemma", "pixtral"])]
        print("Vision capable models found:")
        for vm in vision_models:
            print(f"  - {vm}")
except Exception as e:
    print(f"Error fetching models: {e}")
