"""Customer endpoints."""

from fastapi import APIRouter, HTTPException, Query

from ..db import conn, dict_row

router = APIRouter()


@router.get("/customers")
def list_customers(
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    sql = "SELECT * FROM customers"
    params: list = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    sql += " ORDER BY id LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with conn() as c:
        rows = [dict_row(r) for r in c.execute(sql, params).fetchall()]
    return rows


@router.get("/customers/{customer_id}")
def get_customer(customer_id: str):
    with conn() as c:
        row = c.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="customer not found")
        customer = dict_row(row)
        customer["calls"] = [
            dict_row(r)
            for r in c.execute(
                "SELECT * FROM calls WHERE customer_id = ? ORDER BY created_at DESC, id DESC",
                (customer_id,),
            ).fetchall()
        ]
        customer["actions"] = [
            dict_row(r)
            for r in c.execute(
                "SELECT * FROM actions WHERE customer_id = ? ORDER BY created_at DESC, id DESC",
                (customer_id,),
            ).fetchall()
        ]
    return customer
