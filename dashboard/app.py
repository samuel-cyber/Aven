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
import requests
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

# Backend that owns the BimpeAI integration. Override with API_BASE_URL.
API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")


# --------------------------------------------------------------------------- #
# Place a call (drives the backend /voice endpoints)
# --------------------------------------------------------------------------- #
def _call_panel() -> None:
    with st.expander("📞 Place a call (BimpeAI)", expanded=True):
        cdf = q(
            "SELECT id, name, phone, status, dormant_balance_ngn "
            "FROM customers ORDER BY dormant_balance_ngn DESC"
        )
        if cdf.empty:
            st.info("No customers yet. Run `python -m scripts.seed` in `backend/`.")
            return

        labels = [
            f"{r['name']}  ·  {r['id']}  ·  ₦{_num(r['dormant_balance_ngn']):,.0f}"
            for _, r in cdf.iterrows()
        ]
        ids = list(cdf["id"])
        idx = st.selectbox(
            "Customer",
            options=range(len(ids)),
            format_func=lambda i: labels[i],
            key="call_customer",
        )
        customer_id = ids[idx]

        c1, c2 = st.columns([1, 2])
        test_call = c1.toggle(
            "Test call",
            value=True,
            help="BimpeAI test telephony — works with no live number. Turn off for a real call.",
        )
        c2.caption(f"Backend API: `{API_BASE}`  ·  call is placed by BimpeAI, the agent talks, then press Sync.")

        dial = st.text_input(
            "Dial this number instead (optional)",
            value="",
            placeholder="+2348012345678 — leave blank to use the customer's stored phone",
            help="Put your OWN number here to ring yourself. Works for both test and live calls.",
        ).strip()

        b1, b2 = st.columns(2)
        if b1.button("☎️ Start call", type="primary"):
            try:
                params = {"is_test_call": str(test_call).lower()}
                if dial:
                    params["destination"] = dial
                resp = requests.post(
                    f"{API_BASE}/voice/customers/{customer_id}/call",
                    params=params,
                    timeout=60,
                )
                data = resp.json()
                if resp.ok and data.get("ok"):
                    st.session_state["last_call_id"] = data.get("call_id")
                    st.session_state["last_customer_id"] = customer_id
                    dialed = data.get("destination") or dial or "the customer's number"
                    st.success(
                        f"Call started to `{dialed}` — call_id `{data.get('call_id')}` "
                        f"(status: {data.get('status')}). Let the agent talk, then press Sync."
                    )
                else:
                    st.error(
                        "Could not start call: "
                        + str(data.get("detail") or data.get("error") or resp.text)
                    )
            except Exception as exc:  # noqa: BLE001
                st.error(f"Backend not reachable at {API_BASE}: {exc}")

        if b2.button("⬇️ Sync & process last call"):
            cid = st.session_state.get("last_call_id")
            cust = st.session_state.get("last_customer_id", customer_id)
            if not cid:
                st.warning("No call started in this browser session yet.")
            else:
                with st.spinner("Waiting for the call to end, then extracting…"):
                    try:
                        resp = requests.post(
                            f"{API_BASE}/voice/customers/{cust}/calls/{cid}/sync",
                            params={"wait": "true"},
                            timeout=600,
                        )
                        data = resp.json()
                        if resp.ok:
                            st.success(f"Processed call {cid}: {data}")
                        else:
                            st.error(f"Sync failed: {data}")
                    except Exception as exc:  # noqa: BLE001
                        st.error(f"Sync failed: {exc}")

        with st.form("manual_sync"):
            st.caption("Or sync any call by id (e.g. a call id from the BimpeAI console)")
            m1, m2 = st.columns(2)
            mcust = m1.text_input("Customer id", value=customer_id)
            mcall = m2.text_input("Call id", value=st.session_state.get("last_call_id", ""))
            if st.form_submit_button("Process this call"):
                if mcust and mcall:
                    try:
                        resp = requests.post(
                            f"{API_BASE}/voice/customers/{mcust}/calls/{mcall}/sync",
                            params={"wait": "true"},
                            timeout=600,
                        )
                        st.success(resp.json()) if resp.ok else st.error(resp.text)
                    except Exception as exc:  # noqa: BLE001
                        st.error(f"Sync failed: {exc}")
                else:
                    st.warning("Need both a customer id and a call id.")


# --------------------------------------------------------------------------- #
# Call transcript & structured summary (drill-in, incl. transaction context)
# --------------------------------------------------------------------------- #
def _call_detail_panel() -> None:
    with st.expander("🔍 Call transcript & summary (transactions)", expanded=False):
        calls = q(
            """
            SELECT ca.id AS call_id, ca.customer_id AS customer_id,
                   cu.name AS customer, ca.issue AS issue, ca.sentiment AS sentiment,
                   ca.created_at AS created_at
            FROM calls ca
            JOIN customers cu ON cu.id = ca.customer_id
            ORDER BY ca.created_at DESC
            LIMIT 100
            """
        )
        if calls.empty:
            st.info("No calls captured yet. Place a call above, then press **Sync & process**.")
            return

        ids = [str(x) for x in calls["call_id"].tolist()]
        default = st.session_state.get("last_call_id")
        default_idx = ids.index(default) if default in ids else 0
        idx = st.selectbox(
            "Pick a call",
            options=range(len(ids)),
            index=default_idx,
            format_func=lambda i: (
                f"{calls.iloc[i]['customer']} · {calls.iloc[i]['call_id']} · "
                f"{str(calls.iloc[i]['created_at'])[:19]} · "
                f"{str(calls.iloc[i]['issue'] or '—').replace('_', ' ')}"
            ),
            key="detail_call",
        )
        call_id = ids[idx]

        detail = q("SELECT * FROM calls WHERE id = ?", (call_id,))
        if detail.empty:
            return
        d = detail.iloc[0]

        # --- Customer + transaction ("account") context ------------------- #
        cust_df = q("SELECT * FROM customers WHERE id = ?", (d["customer_id"],))
        if not cust_df.empty:
            c = cust_df.iloc[0]
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Customer", c["name"])
            m2.metric("Status", str(c["status"] or "").title())
            m3.metric("Dormant balance", f"₦{_num(c['dormant_balance_ngn']):,.0f}")
            m4.metric("Est. monthly value", f"₦{_num(c['est_monthly_value_ngn']):,.0f}")
            st.markdown(
                f"**Last transaction / event:** `{c['last_event_type'] or '—'}` — "
                f"{c['last_event_detail'] or 'n/a'}  \n"
                f"**Event date:** {c['last_event_date'] or '—'}  ·  "
                f"**Last active:** {c['last_active_date'] or '—'}  ·  "
                f"**Phone:** `{c['phone']}`  ·  **Language:** {c['preferred_language']}"
            )

        # --- Structured summary ------------------------------------------- #
        st.markdown("#### 🧾 Structured call summary")
        if d["summary"]:
            st.success(d["summary"])
        st.caption(
            f"issue **{d['issue'] or '—'}** · churn reason **{d['churn_reason'] or '—'}** · "
            f"sentiment **{d['sentiment'] or '—'}** · intent to return **{d['intent_to_return'] or '—'}** · "
            f"urgency **{d['urgency'] or '—'}** · fraud **{'yes' if d['fraud_flag'] else 'no'}**"
        )
        if d["reason_detail"]:
            st.markdown(f"**What happened:** {d['reason_detail']}")
        if d["fraud_detail"]:
            st.error(f"🚩 Fraud detail: {d['fraud_detail']}")

        facts = {
            "Issue": d["issue"] or "—",
            "Churn reason": d["churn_reason"] or "—",
            "Reason detail": d["reason_detail"] or "—",
            "Sentiment": d["sentiment"] or "—",
            "Intent to return": d["intent_to_return"] or "—",
            "Urgency": d["urgency"] or "—",
            "Recovery possible": "yes" if d["recovery_possible"] else "no",
            "Fraud flagged": "yes" if d["fraud_flag"] else "no",
            "Resolution offered": d["resolution_offered"] or "—",
            "Customer accepted": "yes" if d["customer_accepted"] else "no",
            "Follow-up needed": "yes" if d["follow_up_needed"] else "no",
            "Duration": f"{int(_num(d['duration_sec']))}s",
            "Extraction source": d["extraction_source"] or "—",
            "Recommended product fix": d["recommended_product_fix"] or "—",
        }
        st.dataframe(
            pd.DataFrame({"field": list(facts), "value": list(facts.values())}),
            width="stretch",
            hide_index=True,
        )

        # --- Transcript ---------------------------------------------------- #
        st.markdown("#### 🗣️ Transcript")
        transcript = d["transcript"]
        if transcript:
            with st.container(height=260):
                st.text(str(transcript))
        else:
            st.info("No transcript stored for this call yet.")
        st.download_button(
            "⬇️ Download transcript (.txt)",
            data=str(transcript or ""),
            file_name=f"{call_id}-transcript.txt",
            mime="text/plain",
        )

        # --- Actions raised for this call --------------------------------- #
        acts = q(
            "SELECT type, detail, status, urgent FROM actions WHERE call_id = ?",
            (call_id,),
        )
        if not acts.empty:
            st.markdown("#### ✅ Actions raised")
            st.dataframe(acts, width="stretch", hide_index=True)


_call_panel()
_call_detail_panel()
st.divider()


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
            st.dataframe(fixes, width="stretch", hide_index=True)

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
        st.dataframe(actions, width="stretch", hide_index=True)

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
        st.dataframe(customers, width="stretch", hide_index=True)


live()
