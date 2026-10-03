"""Voice endpoints: trigger a BimpeAI call and pull its transcript back."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services import voice

router = APIRouter(prefix="/voice", tags=["voice"])


class SyncRequest(BaseModel):
    customer_id: str
    call_id: str
    wait: bool = True


@router.get("/status")
def status():
    """Whether the voice layer is configured (no secrets returned)."""
    return voice.voice_status()


@router.get("/customers/{customer_id}/context")
def customer_context(customer_id: str):
    """The context/variables a BimpeAI agent should receive for this customer."""
    ctx = voice.voice_context(customer_id)
    if ctx is None:
        raise HTTPException(status_code=404, detail="customer not found")
    return ctx


@router.post("/customers/{customer_id}/call")
def start_call(
    customer_id: str,
    is_test_call: Optional[bool] = Query(default=None),
    destination: Optional[str] = Query(
        default=None,
        description="Override the dialled number, e.g. +2348012345678 to ring yourself.",
    ),
):
    """Trigger an outbound BimpeAI call and return its call_id."""
    result = voice.start_voice_call(
        customer_id, is_test_call=is_test_call, destination=destination
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "call failed"))
    return result


@router.post("/customers/{customer_id}/calls/{call_id}/sync")
def sync_call(customer_id: str, call_id: str, wait: bool = Query(default=True)):
    """Fetch the transcript for a call and run extraction + actions on it."""
    return voice.sync_voice_call(customer_id, call_id, wait=wait)


@router.post("/sync")
def sync_call_body(body: SyncRequest):
    """Same as the path form, for simple clients / hackathon curl."""
    return voice.sync_voice_call(body.customer_id, body.call_id, wait=body.wait)
