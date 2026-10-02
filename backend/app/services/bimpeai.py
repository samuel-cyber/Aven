"""BimpeAI Console REST client — the ONLY module that talks to BimpeAI.

Confirmed against docs.bimpe.ai (API Reference + Calls) and the official Python
SDK (github.com/BimpeAI/bimpe-sdk, PyPI ``bimpeai`` 0.4.1) on 2026-10-02:

  Base URL:      https://api.bimpe.ai
  Path prefix:   /api/v1/console
  Auth:          ``Authorization: Bearer sk_...``  (or ``X-Api-Key: sk_...``)
  Envelope:      single resource -> ``{"message", "data"}``
                 list            -> ``{"message", "data": [...], "meta": {...}}``

  Place a call:  POST /agents/{agent_id}/calls
                 body {"destination": "+2348012345678", "is_test_call": true}
                 -> 201 {"data": {"status": "initiated", "call_id", "detail"}}
                 ``is_test_call=true`` uses BimpeAI test telephony (no live
                 channel needed). ``is_test_call=false`` requires a live phone
                 number linked to the agent (see ``phone_numbers`` below).

  Get a call:    GET  /agents/{agent_id}/calls/{call_id}
                 -> CallDetail: Call fields + ``started_at``, ``answered_at``
                 and ``conversation_logs`` — a list of
                 ``{id, role, message, message_type, created_at, attachments}``
                 which is the voice transcript (role is "assistant"/"user").

  List calls:    GET  /agents/{agent_id}/calls?status=&is_test_call=&page=&limit=
  Phone numbers: GET  /phone-numbers   (team-scoped; link one to an agent with
                 PATCH /phone-numbers/{id} {"agent_id": ...} to enable live calls)

Everything in this file is real, current API usage. Nothing else in the
codebase may reference BimpeAI specifics.
"""

from __future__ import annotations

import json
import time

import httpx

from .. import config


class BimpeAIError(RuntimeError):
    """Any failure talking to the BimpeAI Console API."""


def is_configured() -> bool:
    """True when we have enough to attempt a real call."""
    return bool(config.BIMPEAI_API_KEY and config.BIMPEAI_AGENT_ID)


def _url(path: str) -> str:
    return f"{config.BIMPEAI_BASE_URL.rstrip('/')}{config.BIMPEAI_API_PATH}{path}"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.BIMPEAI_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _request(method: str, path: str, *, json_body: dict | None = None, params: dict | None = None) -> dict:
    """Perform one Console API request and unwrap the response envelope."""
    if not config.BIMPEAI_API_KEY:
        raise BimpeAIError("BIMPEAI_API_KEY is not set")
    try:
        resp = httpx.request(
            method,
            _url(path),
            headers=_headers(),
            json=json_body,
            params=params,
            timeout=30.0,
        )
    except httpx.HTTPError as exc:  # network/timeout
        raise BimpeAIError(f"BimpeAI request failed: {exc}") from exc

    if resp.status_code >= 400:
        detail = resp.text
        try:
            body = resp.json()
            detail = body.get("message") or body.get("error") or detail
        except ValueError:
            pass
        raise BimpeAIError(f"BimpeAI {resp.status_code}: {detail}")

    try:
        payload = resp.json()
    except ValueError:
        return {}
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload if isinstance(payload, dict) else {"data": payload}


# --------------------------------------------------------------------------- #
# Outbound calls
# --------------------------------------------------------------------------- #


def start_call(customer_id: str, context: dict, *, is_test_call: bool | None = None) -> dict:
    """Start an outbound call for a customer.

    Returns a dict with at least ``status`` ("initiated"|"busy"|"failed" or
    "stubbed") and, when real, ``call_id`` and ``detail``. When no API key is
    configured it logs the payload and returns ``{"status": "stubbed", ...}``
    so the whole pipeline stays testable offline.
    """
    test_call = config.BIMPEAI_IS_TEST_CALL if is_test_call is None else is_test_call
    destination = context.get("phone") or config.BIMPEAI_TEST_DESTINATION
    if test_call and not destination:
        destination = config.BIMPEAI_TEST_DESTINATION

    body = {
        "destination": destination,
        "is_test_call": bool(test_call),
    }

    if not is_configured():
        print("[bimpeai] API key/agent not configured — would POST:")
        print(json.dumps({"path": f"/agents/{config.BIMPEAI_AGENT_ID}/calls", "body": body}, indent=2))
        return {"status": "stubbed", "call_id": None, "detail": "BimpeAI not configured", "payload": body}

    data = _request("POST", f"/agents/{config.BIMPEAI_AGENT_ID}/calls", json_body=body)
    return {
        "status": data.get("status", "failed"),
        "call_id": data.get("call_id"),
        "detail": data.get("detail"),
        "is_test_call": bool(test_call),
        "raw": data,
    }


def get_call(call_id: str) -> dict:
    """Fetch a single call with its transcript (``conversation_logs``)."""
    return _request("GET", f"/agents/{config.BIMPEAI_AGENT_ID}/calls/{call_id}")


def list_calls(*, status: str | None = None, is_test_call: bool | None = None, limit: int = 20) -> list:
    """List call logs for the configured agent."""
    params: dict = {"limit": limit}
    if status:
        params["status"] = status
    if is_test_call is not None:
        params["is_test_call"] = str(is_test_call).lower()
    data = _request("GET", f"/agents/{config.BIMPEAI_AGENT_ID}/calls", params=params)
    return data if isinstance(data, list) else data.get("data", [])


def wait_for_call(
    call_id: str,
    *,
    timeout_s: float | None = None,
    poll_interval_s: float | None = None,
) -> dict:
    """Poll ``get_call`` until the call reaches a terminal status.

    Returns the final ``CallDetail``, or the last seen state on timeout.
    Never raises for a missing transcript — callers decide what to do.
    """
    timeout_s = config.BIMPEAI_WAIT_TIMEOUT if timeout_s is None else timeout_s
    poll_interval_s = config.BIMPEAI_POLL_INTERVAL if poll_interval_s is None else poll_interval_s

    deadline = time.monotonic() + timeout_s
    last: dict = {}
    while time.monotonic() < deadline:
        last = get_call(call_id)
        if last.get("status") in {"ended", "failed", "busy", "cancelled"}:
            return last
        time.sleep(poll_interval_s)
    return last


# --------------------------------------------------------------------------- #
# Transcript helpers
# --------------------------------------------------------------------------- #


def conversation_to_transcript(conversation_logs) -> str:
    """Flatten BimpeAI ``conversation_logs`` into ``speaker: text`` lines.

    ``role`` is BimpeAI's "assistant"/"user"; map to agent/customer so the
    extraction prompt reads naturally. The message text lives on ``message``.
    """
    if not conversation_logs:
        return ""
    lines: list[str] = []
    for entry in conversation_logs:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role", "?")
        speaker = {"assistant": "agent", "user": "customer", "agent": "agent", "customer": "customer"}.get(
            role, role
        )
        text = entry.get("message")
        if text is None:
            text = entry.get("text", "")
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def transcript_from_call(call_detail: dict) -> str:
    """Pull a ``speaker: text`` transcript out of a CallDetail payload."""
    return conversation_to_transcript(call_detail.get("conversation_logs"))


# --------------------------------------------------------------------------- #
# Phone numbers (team-scoped)
# --------------------------------------------------------------------------- #


def list_phone_numbers() -> list:
    """List phone numbers assigned to the team."""
    data = _request("GET", "/phone-numbers")
    return data if isinstance(data, list) else data.get("data", [])


def link_phone_number(phone_number_id: str, agent_id: str, label: str | None = None) -> dict:
    """Link a provisioned number to an agent (enables live, non-test calls)."""
    body: dict = {"agent_id": agent_id}
    if label:
        body["label"] = label
    return _request("PATCH", f"/phone-numbers/{phone_number_id}", json_body=body)
