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


# ─── Gemini AI Vision Processing ──────────────────────────────────────────────
# Model waterfall — ALL entries verified working with this API key (probed 2026-09-15).
# Lightest/least-demanded first to minimise 503s and quota usage.
_GEMINI_MODELS = [
    "gemini-3.1-flash-lite",   # Primary:   lightest, confirmed ✅
    "gemini-3.5-flash-lite",   # Secondary: also light, confirmed ✅
    "gemini-3.6-flash",        # Tertiary:  confirmed ✅, our battle-tested original
]

def _process_image_with_gemini(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Ingest document image bytes, call Gemini multimodal vision, and parse structured JSON.
    Tries models in order of least demand → most capable.
    On 503 (model overloaded), moves to the next model in the waterfall.
    """
    settings = get_settings()
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY is not configured on the server."
        )

    base64_image = base64.b64encode(image_bytes).decode("utf-8")

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

    safe_mime = mime_type if mime_type in ["image/jpeg", "image/jpg", "image/png", "image/webp"] else "image/jpeg"
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

    last_error = None
    for model in _GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
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
                result = json.loads(raw_text)
                print(f"[GEMINI VISION] Success with model: {model}", flush=True)
                return result

        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            print(f"[GEMINI VISION] {model} → HTTP {e.code}: {err_msg[:200]}", flush=True)

            if e.code in (503, 429, 404):
                # 503/429: overloaded/rate-limited — try next model
                # 404: model deprecated/removed — try next model
                last_error = e.code
                continue

            # Hard errors (400 bad request, 401 auth) — fail immediately
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini AI Vision error ({model}): HTTP {e.code}"
            )

        except Exception as e:
            print(f"[GEMINI VISION] {model} → Exception: {e}", flush=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to process image with Gemini AI Vision: {str(e)}"
            )

    # All models exhausted
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="All Gemini AI Vision models are temporarily overloaded. Please retry in a few seconds."
    )


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

