"""
Scan Session Routes - Ephemeral in-memory sessions for QR code OCR scan-to-fill flow.

Flow:
1. PC browser creates a session (POST /scan-sessions)
2. QR code encodes the session URL with secret
3. Phone scans QR, uploads document photo, runs OCR client-side
4. Phone POSTs extracted data to session (POST /scan-sessions/{id}/result)
5. PC browser polls for results (GET /scan-sessions/{id}/result)
"""
import uuid
import time
import threading
import json
import sys
import base64
import urllib.request
import urllib.error
import re
import ast
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, Dict, Any
from config import get_settings

router = APIRouter(prefix="/scan-sessions", tags=["scan"])

# ─── In-Memory Session Store ──────────────────────────────────────────────────
# Each session lives for 10 minutes max. No database needed.
SESSION_TTL_SECONDS = 600  # 10 minutes
_sessions: Dict[str, dict] = {}
_lock = threading.Lock()



def _cleanup_expired():
    """Remove sessions older than TTL. Called periodically."""
    now = time.time()
    with _lock:
        expired = [sid for sid, s in _sessions.items() if now - s["created_at"] > SESSION_TTL_SECONDS]
        for sid in expired:
            del _sessions[sid]


def _start_cleanup_timer():
    """Run cleanup every 5 minutes in a background daemon thread."""
    def run():
        while True:
            time.sleep(300)  # 5 minutes
            _cleanup_expired()

    t = threading.Thread(target=run, daemon=True)
    t.start()


# Start the cleanup timer when the module loads
_start_cleanup_timer()


# ─── Schemas ──────────────────────────────────────────────────────────────────
class ScanSessionCreateResponse(BaseModel):
    session_id: str
    session_secret: str


class ScanResultSubmit(BaseModel):
    session_secret: str
    extracted_data: Dict[str, Any]


class ScanSessionStatusResponse(BaseModel):
    status: str  # "waiting" | "completed" | "expired"
    data: Optional[Dict[str, Any]] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/", response_model=ScanSessionCreateResponse, status_code=status.HTTP_201_CREATED)
def create_scan_session():
    """
    Create a new scan session. Returns a session_id (public, in QR code URL)
    and a session_secret (private, only shared with the phone via URL param).
    """
    _cleanup_expired()  # Opportunistic cleanup

    session_id = uuid.uuid4().hex[:12]  # Short enough for QR codes
    session_secret = uuid.uuid4().hex

    with _lock:
        _sessions[session_id] = {
            "secret": session_secret,
            "status": "waiting",
            "data": None,
            "created_at": time.time()
        }

    return ScanSessionCreateResponse(
        session_id=session_id,
        session_secret=session_secret
    )


@router.post("/{session_id}/result", status_code=status.HTTP_200_OK)
def submit_scan_result(session_id: str, payload: ScanResultSubmit):
    """
    Phone submits OCR-extracted data to the session.
    Requires the session_secret for write authorization.
    """
    with _lock:
        session = _sessions.get(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session not found or expired."
        )

    # Verify the secret to prevent unauthorized writes
    if session["secret"] != payload.session_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid session secret."
        )

    # Check TTL
    if time.time() - session["created_at"] > SESSION_TTL_SECONDS:
        with _lock:
            _sessions.pop(session_id, None)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Scan session has expired."
        )

    # Store the extracted data
    with _lock:
        _sessions[session_id]["status"] = "completed"
        _sessions[session_id]["data"] = payload.extracted_data

    # Log clearly for Render application logs
    try:
        data = payload.extracted_data or {}
        print(f"\n======================================================================", flush=True)
        print(f"🔍 [OCR SUBMITTED] Session ID: {session_id}", flush=True)
        print(f"CUSTOMER: {data.get('customer_name')}", flush=True)
        print(f"INVOICE NO: {data.get('invoice_number')}", flush=True)
        print(f"WAYBILL NO: {data.get('waybill_number')}", flush=True)
        print(f"PRODUCTS: {json.dumps(data.get('products', []), indent=2)}", flush=True)
        print(f"FULL PAYLOAD: {json.dumps(data, indent=2)}", flush=True)
        print(f"======================================================================\n", flush=True)
    except Exception as e:
        print(f"[OCR LOGGING ERROR]: {e}", flush=True)

    return {"message": "Scan result submitted successfully."}


@router.get("/{session_id}/result", response_model=ScanSessionStatusResponse)
def poll_scan_result(session_id: str):
    """
    PC browser polls this endpoint to check if the phone has submitted data.
    Returns status: "waiting" (no data yet) or "completed" (data available).
    """
    with _lock:
        session = _sessions.get(session_id)

    if not session:
        return ScanSessionStatusResponse(status="expired", data=None)

    # Check TTL
    if time.time() - session["created_at"] > SESSION_TTL_SECONDS:
        with _lock:
            _sessions.pop(session_id, None)
        return ScanSessionStatusResponse(status="expired", data=None)

    if session["status"] == "completed":
        cust = (session.get("data") or {}).get("customer_name", "Unknown")
        print(f"📡 [OCR POLLED - COMPLETED] Session: {session_id} serving data for customer: {cust}", flush=True)

    return ScanSessionStatusResponse(
        status=session["status"],
        data=session["data"]
    )


# ─── AI Vision Processing (NVIDIA API Primary + Gemini Fallback) ─────────────
_NVIDIA_MODELS = [
    "meta/llama-3.2-11b-vision-instruct",   # Fast 11B multimodal model (3-5s response)
]

_GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
]

def _sanitize_extracted_data(data: dict) -> dict:
    """Sanitize extracted dict: convert placeholder strings ('not present', 'none') to None/empty, and quantities to integer."""
    if not isinstance(data, dict):
        return {}

    sanitized = dict(data)

    # 1. Clean driver & vehicle placeholder strings
    for field in ["driver_name", "vehicle_number"]:
        val = str(sanitized.get(field) or "").strip().lower()
        if val in ["not present", "none", "nil", "n/a", "unknown", "null", "undefined"]:
            sanitized[field] = ""

    # 2. Clean product quantities (e.g. 2.300 -> 2)
    if isinstance(sanitized.get("products"), list):
        clean_products = []
        for p in sanitized["products"]:
            if isinstance(p, dict):
                p_copy = dict(p)
                raw_qty = p_copy.get("quantity", 1)
                try:
                    qty_num = float(raw_qty)
                    p_copy["quantity"] = max(1, int(round(qty_num)))
                except (ValueError, TypeError):
                    p_copy["quantity"] = 1
                clean_products.append(p_copy)
            elif isinstance(p, str):
                clean_products.append({"name": p, "quantity": 1})
        sanitized["products"] = clean_products

    return sanitized


def _clean_json_response(raw_text: str) -> dict:
    """
    Strip markdown codeblock wrappers, repair common LLM syntax flaws
    (single quotes, trailing commas, Python None/True/False), parse JSON safely, and sanitize values.
    """
    cleaned = raw_text.strip()

    # Strip markdown wrappers
    if "```" in cleaned:
        cleaned = re.sub(r"```(?:json)?", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.replace("```", "")

    # Extract JSON object substring
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start:end+1]

    raw_dict = None

    # Attempt 1: Standard json.loads
    try:
        raw_dict = json.loads(cleaned)
    except Exception:
        pass

    if raw_dict is None:
        # Attempt 2: Repair common JSON syntax errors (trailing commas, Python constants)
        repaired = re.sub(r',\s*([\]}])', r'\1', cleaned)
        repaired_const = re.sub(r'\bNone\b', 'null', repaired)
        repaired_const = re.sub(r'\bTrue\b', 'true', repaired_const)
        repaired_const = re.sub(r'\bFalse\b', 'false', repaired_const)

        try:
            raw_dict = json.loads(repaired_const)
        except Exception:
            pass

    if raw_dict is None:
        # Attempt 3: Python AST literal_eval (handles single quotes, None, True, False natively)
        try:
            parsed_ast = ast.literal_eval(cleaned)
            if isinstance(parsed_ast, dict):
                raw_dict = parsed_ast
        except Exception:
            pass

    if raw_dict is None:
        # Attempt 4: AST evaluation on repaired text
        try:
            parsed_ast = ast.literal_eval(repaired)
            if isinstance(parsed_ast, dict):
                raw_dict = parsed_ast
        except Exception as e:
            print(f"[JSON PARSE ERROR] Raw text snippet: {raw_text[:250]}", flush=True)
            raise e

    return _sanitize_extracted_data(raw_dict)


def _process_image_with_ai(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Ingest document image bytes, call multimodal AI vision, and parse structured JSON.
    Primary: NVIDIA API (Ultra-fast, high quota limits).
    Fallback: Gemini AI Vision Waterfall.
    """
    settings = get_settings()
    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    safe_mime = mime_type if mime_type in ["image/jpeg", "image/jpg", "image/png", "image/webp"] else "image/jpeg"

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
  "driver_name": "string if present, otherwise null",
  "vehicle_number": "string if present, otherwise null",
  "products": [
    {
      "name": "string (product description)",
      "quantity": 10
    }
  ]
}

Important Rules:
- If driver_name or vehicle_number is missing, set them to null. Do NOT write "not present" or "n/a".
- Ensure quantity is an integer count (e.g. 2, 25, 400).
- Return ONLY valid JSON matching this schema, with no Markdown code block wrappers or extra text.
"""

    # ── Stage 1: Try NVIDIA API Vision Models ──────────────────────────────────
    nvidia_key = getattr(settings, "NVIDIA_API_KEY", None)
    if nvidia_key:
        data_uri = f"data:{safe_mime};base64,{base64_image}"
        headers = {
            "Authorization": f"Bearer {nvidia_key}",
            "Content-Type": "application/json"
        }

        for model in _NVIDIA_MODELS:
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
            req = urllib.request.Request(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            try:
                print(f"[NVIDIA VISION] Trying model: {model}", flush=True)
                with urllib.request.urlopen(req, timeout=12) as resp:
                    resp_body = resp.read().decode("utf-8")
                    data = json.loads(resp_body)
                    raw_text = data["choices"][0]["message"]["content"]
                    print(f"\n🤖 [RAW LLM OUTPUT - {model}]:\n{raw_text}\n", flush=True)
                    result = _clean_json_response(raw_text)
                    print(f"[NVIDIA VISION] Success with model: {model}", flush=True)
                    return result
            except Exception as e:
                print(f"[NVIDIA VISION] {model} failed: {e}", flush=True)

    # ── Stage 2: Fallback to Gemini AI Vision Waterfall ───────────────────────
    gemini_key = getattr(settings, "GEMINI_API_KEY", None)
    if gemini_key:
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": safe_mime,
                            "data": base64_image
                        }
                    }
                ]
            }],
            "generationConfig": {
                "response_mime_type": "application/json"
            }
        }
        payload_bytes = json.dumps(payload).encode("utf-8")

        for model in _GEMINI_MODELS:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
            req = urllib.request.Request(
                url,
                data=payload_bytes,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            try:
                print(f"[GEMINI VISION] Trying model: {model}", flush=True)
                with urllib.request.urlopen(req, timeout=60) as resp:
                    resp_body = resp.read().decode("utf-8")
                    data = json.loads(resp_body)
                    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    print(f"\n🤖 [RAW LLM OUTPUT - {model}]:\n{raw_text}\n", flush=True)
                    result = _clean_json_response(raw_text)
                    print(f"[GEMINI VISION] Success with model: {model}", flush=True)
                    return result
            except Exception as e:
                print(f"[GEMINI VISION] {model} failed: {e}", flush=True)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="All AI Vision models (NVIDIA & Gemini) are temporarily unavailable. Please retry in a few seconds."
    )

def _process_image_with_gemini(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    return _process_image_with_ai(image_bytes, mime_type=mime_type)



@router.post("/{session_id}/process-image", status_code=status.HTTP_200_OK)
async def process_scan_image(
    session_id: str,
    file: UploadFile = File(...),
    session_secret: str = Form(...),
    is_last: str = Form(default="true"),           # "true" | "false" — is last image of this specific order
    order_index: int = Form(default=0),            # 0, 1, 2... — index of the order in the batch
    is_batch_complete: str = Form(default="true")  # "true" | "false" — whether all batch orders are uploaded
):
    """
    Phone uploads document photo directly to the server.
    Backend sends image to Gemini multimodal vision, extracts structured JSON,
    and merges it with any previously uploaded image data for the same session and order index.

    Batch order scanning rules:
    - Multiple orders can be scanned in one session (order_index=0, 1, 2...).
    - Multi-page sheets for the SAME order (same order_index) merge their product lists and fill missing header fields.
    - Session data contains "orders": [ order0, order1, ... ] as well as top-level fields from order 0 for backward compatibility.
    - Session status is set to "completed" when is_batch_complete=true (and is_last=true for current order).
    """
    with _lock:
        session = _sessions.get(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan session not found or expired."
        )

    if session["secret"] != session_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid session secret."
        )

    if time.time() - session["created_at"] > SESSION_TTL_SECONDS:
        with _lock:
            _sessions.pop(session_id, None)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Scan session has expired."
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    mime_type = file.content_type or "image/jpeg"
    new_data = _process_image_with_gemini(content, mime_type=mime_type)

    # Convert order_index safely if passed as Form or string
    order_idx = 0
    if isinstance(order_index, int):
        order_idx = order_index
    elif isinstance(order_index, str) and order_index.isdigit():
        order_idx = int(order_index)

    # ── Merge with existing session data ──────────────────────────────────────
    with _lock:
        if "orders" not in _sessions[session_id]:
            _sessions[session_id]["orders"] = {}

        existing_order = _sessions[session_id]["orders"].get(order_idx) or {}

        if not existing_order:
            # First image for this order index
            merged_order = new_data
        else:
            # Subsequent image for same order index — fill missing header fields, append products
            HEADER_FIELDS = ["customer_name", "invoice_number", "waybill_number",
                             "brand", "date", "driver_name", "vehicle_number"]
            merged_order = dict(existing_order)
            for field in HEADER_FIELDS:
                if not merged_order.get(field) and new_data.get(field):
                    merged_order[field] = new_data[field]

            # Append products from new image
            existing_products = merged_order.get("products") or []
            new_products = new_data.get("products") or []
            merged_order["products"] = existing_products + new_products

        # Save order back to session orders dict
        _sessions[session_id]["orders"][order_idx] = merged_order

        # Sort all orders by index
        sorted_indices = sorted(_sessions[session_id]["orders"].keys())
        orders_list = [_sessions[session_id]["orders"][i] for i in sorted_indices]

        # Top-level session data payload: orders_list[0] merged with "orders" array
        primary_order = dict(orders_list[0]) if orders_list else {}
        primary_order["orders"] = orders_list
        _sessions[session_id]["data"] = primary_order

        # Session completion flags
        is_last_flag = is_last.lower() == "true" if isinstance(is_last, str) else True
        is_batch_flag = is_batch_complete.lower() == "true" if isinstance(is_batch_complete, str) else True

        if is_last_flag and is_batch_flag:
            _sessions[session_id]["status"] = "completed"
        else:
            _sessions[session_id]["status"] = "partial"

    print(f"\n======================================================================", flush=True)
    print(f"✨ [GEMINI VISION PROCESSED] Session ID: {session_id} | Order Index: {order_idx} | is_last={is_last} | is_batch_complete={is_batch_complete}", flush=True)
    print(f"CUSTOMER: {merged_order.get('customer_name')}", flush=True)
    print(f"INVOICE NO: {merged_order.get('invoice_number')}", flush=True)
    print(f"WAYBILL NO: {merged_order.get('waybill_number')}", flush=True)
    print(f"PRODUCTS ({len(merged_order.get('products', []))}): {json.dumps(merged_order.get('products', []), indent=2)}", flush=True)
    print(f"TOTAL ORDERS IN BATCH: {len(orders_list)}", flush=True)
    print(f"======================================================================\n", flush=True)

    return {
        "message": "Image processed successfully with Gemini AI Vision",
        "order_index": order_idx,
        "extracted_data": merged_order,
        "total_orders_in_batch": len(orders_list),
        "all_orders": orders_list
    }

