"""Aven dashboard — Streamlit, reads the SQLite DB directly, auto-refreshes.

Run:  streamlit run dashboard/app.py

By default it looks for the database at backend/aven.db and falls back to
./aven.db. Override with the DB_PATH environment variable, e.g.:

    streamlit run dashboard/app.py  --  (then set DB_PATH in your shell)
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pandas as pd
import streamlit as st

# --------------------------------------------------------------------------- #
# Database resolution
# --------------------------------------------------------------------------- #
_HERE = Path(__file__).resolve().parent


def _resolve_db_path() -> str:
    env = os.getenv("DB_PATH")
    if env:
        return env
    candidates = [
        _HERE.parent / "backend" / "aven.db",  # repo layout: Aven/backend/aven.db
        _HERE.parent / "aven.db",              # repo layout: Aven/aven.db
        _HERE / "aven.db",
        Path.cwd() / "aven.db",
        Path.cwd() / "backend" / "aven.db",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    # Default to the canonical location even if not created yet.
    return str(_HERE.parent / "backend" / "aven.db")


DB = _resolve_db_path()

st.set_page_config(page_title="Aven", page_icon="📞", layout="wide")


def q(sql: str, params: tuple | None = None) -> pd.DataFrame:
    """Run a read-only query and return a DataFrame. Never raises."""
    try:
        with sqlite3.connect(DB) as c:
            return pd.read_sql_query(sql, c, params=params)
    except Exception as exc:  # noqa: BLE001 - dashboard must never crash on stage
        st.warning(f"Could not read the database at `{DB}`: {exc}")
        return pd.DataFrame()


def _num(value, default: float = 0.0) -> float:
    try:
        if value is None or pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------- #
# Header
# --------------------------------------------------------------------------- #
st.title("Aven")
st.caption("Voice-first dormant customer recovery — powered by BimpeAI")
st.caption(f"DB: `{DB}`")


@st.fragment(run_every=3)
def live() -> None:
    # --- KPIs ------------------------------------------------------------- #
    kpi = q(
        """
        SELECT COUNT(*) AS contacted,
               COALESCE(SUM(status='recovered'), 0) AS recovered,
               COALESCE(SUM(status='escalated'), 0) AS escalated,
               COALESCE(SUM(CASE WHEN status='recovered' THEN dormant_balance_ngn END), 0)
                   AS ngn_recovered
        FROM customers
        WHERE status != 'dormant'
        """
    )
    row = kpi.iloc[0] if not kpi.empty else {}
    contacted = int(_num(row.get("contacted")))
    recovered = int(_num(row.get("recovered")))
    escalated = int(_num(row.get("escalated")))
    ngn_recovered = _num(row.get("ngn_recovered"))

    total_df = q("SELECT COALESCE(SUM(dormant_balance_ngn), 0) AS v FROM customers")
    total = _num(total_df.iloc[0]["v"]) if not total_df.empty else 0.0

    open_actions_df = q("SELECT COUNT(*) AS n FROM actions WHERE status='open'")
    open_actions = int(_num(open_actions_df.iloc[0]["n"])) if not open_actions_df.empty else 0

    a, b, c, d, e, f = st.columns(6)
    a.metric("Customers called", contacted)
    b.metric("Recovered", recovered)
    c.metric("Recovery rate", f"{(recovered / contacted * 100):.0f}%" if contacted else "—")
    d.metric("Urgent escalations", escalated)
    e.metric("₦ dormant total", f"₦{total:,.0f}")
    f.metric("₦ recovered", f"₦{ngn_recovered:,.0f}")

    # --- Charts ----------------------------------------------------------- #
    left, right = st.columns(2)

    reasons = q(
        """
        SELECT ca.churn_reason AS reason,
               COUNT(*) AS calls,
               COALESCE(SUM(cu.dormant_balance_ngn), 0) AS ngn_at_risk,
               COALESCE(SUM(cu.status='recovered'), 0) AS recovered
        FROM calls ca
        JOIN customers cu ON cu.id = ca.customer_id
        WHERE ca.churn_reason IS NOT NULL
        GROUP BY ca.churn_reason
        ORDER BY ngn_at_risk DESC
        """
    )
    with left:
        st.subheader("₦ at risk by churn reason")
        if not reasons.empty:
            chart = reasons.set_index("reason")["ngn_at_risk"]
            chart.index = [str(i).replace("_", " ") for i in chart.index]
            st.bar_chart(chart)
            top = reasons.iloc[0]
            fix = q(
                "SELECT recommended_product_fix AS f FROM calls "
                "WHERE churn_reason = ? AND recommended_product_fix IS NOT NULL "
                "ORDER BY created_at DESC LIMIT 1",
                (top["reason"],),
            )
            fix_text = fix.iloc[0]["f"] if not fix.empty else ""
            st.info(
                f"**Top fix to ship:** {str(top['reason']).replace('_', ' ')} "
                f"(₦{_num(top['ngn_at_risk']):,.0f} at risk). {fix_text or ''}"
            )
        else:
            st.info("No calls captured yet. Fire one from the backend and it will appear here.")

    with right:
        st.subheader("Live call feed")
        feed = q(
            """
            SELECT cu.name AS name, ca.sentiment AS sentiment,
                   ca.churn_reason AS churn_reason, ca.summary AS summary,
                   ca.created_at AS created_at
            FROM calls ca
            JOIN customers cu ON cu.id = ca.customer_id
            ORDER BY ca.created_at DESC
            LIMIT 6
            """
        )
        if feed.empty:
            st.info("Waiting for the first call…")
        for _, r in feed.iterrows():
            reason = str(r["churn_reason"] or "unknown").replace("_", " ")
            sentiment = r["sentiment"] or "neutral"
            st.markdown(f"**{r['name']}** — {reason} · {sentiment}  \n{r['summary'] or ''}")
            st.divider()

    # --- Product fixes ---------------------------------------------------- #
    fixes = q(
        """
        SELECT COALESCE(recommended_product_fix, 'n/a') AS fix, COUNT(*) AS calls
        FROM calls
        WHERE recommended_product_fix IS NOT NULL
        GROUP BY recommended_product_fix
        ORDER BY calls DESC
        LIMIT 5
        """
    )
    with st.expander("🔧 Top product fixes to ship", expanded=False):
        if fixes.empty:
            st.write("None captured yet.")
        else:
            st.dataframe(fixes, use_container_width=True, hide_index=True)

    # --- Actions ---------------------------------------------------------- #
    st.subheader("Actions taken")
    actions = q(
        """
        SELECT a.created_at AS time, cu.name AS customer, a.type AS action,
               a.detail AS detail,
               CASE a.status WHEN 'done' THEN '✔ done' ELSE 'open' END AS state,
               CASE a.urgent WHEN 1 THEN 'URGENT' ELSE '' END AS flag
        FROM actions a
        JOIN customers cu ON cu.id = a.customer_id
        ORDER BY a.created_at DESC
        LIMIT 12
        """
    )
    if actions.empty:
        st.info("No actions yet.")
    else:
        st.dataframe(actions, use_container_width=True, hide_index=True)

    # --- Customers -------------------------------------------------------- #
    with st.expander("👥 Customers", expanded=False):
        customers = q(
            """
            SELECT id, name, phone, status, preferred_language,
                   last_event_type, dormant_balance_ngn, last_active_date
            FROM customers
            ORDER BY dormant_balance_ngn DESC
            """
        )
        st.dataframe(customers, use_container_width=True, hide_index=True)


live()
