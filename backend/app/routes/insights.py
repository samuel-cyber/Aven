"""Insights endpoint: KPIs, breakdowns and product fixes for the dashboard."""

from fastapi import APIRouter

from ..db import conn
from ..schemas import (
    InsightKpi,
    InsightOut,
    IssueRow,
    ProductFixRow,
    ReasonRow,
)

router = APIRouter()


@router.get("/insights", response_model=InsightOut)
def insights() -> InsightOut:
    with conn() as c:
        kpi_row = c.execute(
            """
            SELECT
              SUM(CASE WHEN status != 'dormant' THEN 1 ELSE 0 END) AS contacted,
              SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) AS recovered,
              SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated,
              COALESCE(SUM(dormant_balance_ngn), 0) AS ngn_at_risk,
              COALESCE(SUM(CASE WHEN status = 'recovered' THEN dormant_balance_ngn END), 0)
                AS ngn_recovered
            FROM customers
            """
        ).fetchone()
        contacted = kpi_row["contacted"] or 0
        recovered = kpi_row["recovered"] or 0
        escalated = kpi_row["escalated"] or 0
        kpi = InsightKpi(
            contacted=contacted,
            recovered=recovered,
            escalated=escalated,
            recovery_rate=(recovered / contacted) if contacted else 0.0,
            ngn_at_risk=kpi_row["ngn_at_risk"] or 0.0,
            ngn_recovered=kpi_row["ngn_recovered"] or 0.0,
            open_actions=c.execute(
                "SELECT COUNT(*) FROM actions WHERE status = 'open'"
            ).fetchone()[0],
            open_escalations=c.execute(
                "SELECT COUNT(*) FROM actions WHERE status = 'open' AND urgent = 1"
            ).fetchone()[0],
        )

        by_reason = [
            ReasonRow(**dict(r))
            for r in c.execute(
                """
                SELECT ca.churn_reason AS reason, COUNT(*) AS calls,
                       COALESCE(SUM(cu.dormant_balance_ngn), 0) AS ngn_at_risk,
                       SUM(CASE WHEN cu.status = 'recovered' THEN 1 ELSE 0 END) AS recovered
                FROM calls ca JOIN customers cu ON cu.id = ca.customer_id
                GROUP BY ca.churn_reason
                ORDER BY ngn_at_risk DESC
                """
            ).fetchall()
        ]

        by_issue = [
            IssueRow(**dict(r))
            for r in c.execute(
                """
                SELECT issue, COUNT(*) AS calls FROM calls
                GROUP BY issue ORDER BY calls DESC
                """
            ).fetchall()
        ]

        top_fixes = [
            ProductFixRow(**dict(r))
            for r in c.execute(
                """
                SELECT recommended_product_fix AS fix, COUNT(*) AS calls FROM calls
                WHERE recommended_product_fix IS NOT NULL
                  AND recommended_product_fix != ''
                  AND recommended_product_fix != 'n/a'
                GROUP BY recommended_product_fix
                ORDER BY calls DESC
                LIMIT 5
                """
            ).fetchall()
        ]

    return InsightOut(kpi=kpi, by_reason=by_reason, by_issue=by_issue, top_product_fixes=top_fixes)
