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
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any

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

    return ScanSessionStatusResponse(
        status=session["status"],
        data=session["data"]
    )
