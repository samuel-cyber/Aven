"""Action endpoints."""

from fastapi import APIRouter, HTTPException, Query

from ..db import conn, dict_row

router = APIRouter()


@router.get("/actions")
def list_actions(
    customer_id: str | None = Query(default=None),
    type: str | None = Query(default=None),  # noqa: A002 - matches the API contract
    urgent: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    sql = "SELECT * FROM actions"
    clauses: list[str] = []
    params: list = []
    if customer_id:
        clauses.append("customer_id = ?")
        params.append(customer_id)
    if type:
        clauses.append("type = ?")
        params.append(type)
    if urgent is not None:
        clauses.append("urgent = ?")
        params.append(1 if urgent else 0)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with conn() as c:
        rows = [dict_row(r) for r in c.execute(sql, params).fetchall()]
    return rows


@router.post("/actions/{action_id}/resolve")
def resolve_action(action_id: int):
    with conn() as c:
        cur = c.execute("UPDATE actions SET status = 'done' WHERE id = ?", (action_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="action not found")
    return {"ok": True, "id": action_id, "status": "done"}
