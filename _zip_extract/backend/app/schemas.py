"""Pydantic contracts: webhook payload, LLM extraction, API responses."""

from typing import Literal, Optional, Union

from pydantic import BaseModel

ActionType = Literal[
    "retry_ticket", "fee_waiver", "reactivation_link", "human_callback", "fraud_escalation"
]


class WebhookPayload(BaseModel):
    call_id: str
    customer_id: str
    transcript: Union[str, list, None] = None
    duration_sec: int = 0

    # Native BimpeAI CallDetail fields (all optional). Sending these lets the
    # real BimpeAI post-call payload be POSTed straight to /webhooks/bimpeai
    # without reshaping. `conversation_logs` is BimpeAI's voice transcript.
    conversation_logs: Optional[list] = None
    duration_seconds: Optional[int] = None
    status: Optional[str] = None


class Extraction(BaseModel):
    issue: Literal[
        "failed_transfer", "unexpected_fee", "poor_ux", "card_problem",
        "kyc_block", "fraud_report", "no_need", "other",
    ]
    churn_reason: Literal[
        "failed_transaction", "fees", "trust_security", "bad_support",
        "competitor", "no_need", "other",
    ]
    reason_detail: str
    sentiment: Literal["positive", "neutral", "negative"]
    intent: Literal["willing_to_return", "unsure", "not_returning"]
    intent_to_return: Literal["yes", "maybe", "no"]
    urgency: Literal["low", "medium", "high"]
    recovery_possible: bool
    fraud_flag: bool = False
    fraud_detail: Optional[str] = None
    recommended_action: Literal[
        "retry_ticket", "fee_waiver", "reactivation_link",
        "human_callback", "fraud_escalation", "none",
    ]
    resolution_offered: Literal[
        "retry_ticket", "fee_waiver", "reactivation_link", "human_callback", "none"
    ]
    customer_accepted: bool
    follow_up_needed: bool
    summary: str
    recommended_product_fix: str


# Returned when extraction fails twice (or no API key is configured):
# the pipeline must never crash during the demo.
FALLBACK = Extraction(
    issue="other",
    churn_reason="other",
    reason_detail="Extraction failed; review transcript.",
    sentiment="neutral",
    intent="unsure",
    intent_to_return="maybe",
    urgency="medium",
    recovery_possible=True,
    fraud_flag=False,
    fraud_detail=None,
    recommended_action="human_callback",
    resolution_offered="human_callback",
    customer_accepted=False,
    follow_up_needed=True,
    summary="Automatic analysis failed. Please review the transcript manually.",
    recommended_product_fix="n/a",
)


class CustomerOut(BaseModel):
    id: str
    name: str
    phone: str
    preferred_language: Optional[str] = "en"
    last_active_date: Optional[str] = None
    dormant_balance_ngn: float = 0.0
    est_monthly_value_ngn: float = 0.0
    last_event_type: Optional[str] = None
    last_event_detail: Optional[str] = None
    last_event_date: Optional[str] = None
    status: str = "dormant"


class CallOut(BaseModel):
    id: str
    customer_id: str
    status: str = "completed"
    transcript: Optional[str] = None
    duration_sec: int = 0
    created_at: Optional[str] = None
    churn_reason: Optional[str] = None
    reason_detail: Optional[str] = None
    issue: Optional[str] = None
    sentiment: Optional[str] = None
    intent_to_return: Optional[str] = None
    urgency: Optional[str] = None
    recovery_possible: int = 0
    fraud_flag: int = 0
    fraud_detail: Optional[str] = None
    resolution_offered: Optional[str] = None
    customer_accepted: int = 0
    follow_up_needed: int = 0
    summary: Optional[str] = None
    recommended_product_fix: Optional[str] = None
    extraction_source: Optional[str] = None


class ActionOut(BaseModel):
    id: int
    call_id: Optional[str] = None
    customer_id: Optional[str] = None
    type: str
    detail: Optional[str] = None
    status: str = "open"
    urgent: int = 0
    created_at: Optional[str] = None


class InsightKpi(BaseModel):
    contacted: int = 0
    recovered: int = 0
    escalated: int = 0
    recovery_rate: float = 0.0
    ngn_at_risk: float = 0.0
    ngn_recovered: float = 0.0
    open_actions: int = 0
    open_escalations: int = 0


class ReasonRow(BaseModel):
    reason: str
    calls: int = 0
    ngn_at_risk: float = 0.0
    recovered: int = 0


class IssueRow(BaseModel):
    issue: Optional[str] = None
    calls: int = 0


class ProductFixRow(BaseModel):
    fix: Optional[str] = None
    calls: int = 0


class InsightOut(BaseModel):
    kpi: InsightKpi
    by_reason: list[ReasonRow] = []
    by_issue: list[IssueRow] = []
    top_product_fixes: list[ProductFixRow] = []
