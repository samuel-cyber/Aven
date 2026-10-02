"""Call endpoints."""

from fastapi import APIRouter, HTTPException, Query

from ..db import conn, dict_row

router = APIRouter()

# List view: everything except the (bulky) transcript.
CALL_LIST_COLS = (
    "id, customer_id, status, duration_sec, created_at, churn_reason, reason_detail, "
    "issue, sentiment, intent_to_return, urgency, recovery_possible, fraud_flag, "
    "fraud_detail, resolution_offered, customer_accepted, follow_up_needed, summary, "
    "recommended_product_fix, extraction_source"
)


@router.get("/calls")
def list_calls(
    customer_id: str | None = Query(default=None),
    churn_reason: str | None = Query(default=None),
    fraud_flag: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    sql = f"SELECT {CALL_LIST_COLS} FROM calls"
    clauses: list[str] = []
    params: list = []
    if customer_id:
        clauses.append("customer_id = ?")
        params.append(customer_id)
    if churn_reason:
        clauses.append("churn_reason = ?")
        params.append(churn_reason)
    if fraud_flag is not None:
        clauses.append("fraud_flag = ?")
        params.append(1 if fraud_flag else 0)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with conn() as c:
        rows = [dict_row(r) for r in c.execute(sql, params).fetchall()]
    return rows


@router.get("/calls/{call_id}")
def get_call(call_id: str):
    with conn() as c:
        row = c.execute("SELECT * FROM calls WHERE id = ?", (call_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="call not found")
        call = dict_row(row)
        call["actions"] = [
            dict_row(r)
            for r in c.execute(
                "SELECT * FROM actions WHERE call_id = ? ORDER BY created_at DESC, id DESC",
                (call_id,),
            ).fetchall()
        ]
    return call
