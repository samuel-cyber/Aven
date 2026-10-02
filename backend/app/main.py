"""Aven FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routes import actions, calls, customers, insights, voice, webhooks

app = FastAPI(title="Aven", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers.router)
app.include_router(calls.router)
app.include_router(actions.router)
app.include_router(insights.router)
app.include_router(webhooks.router)
app.include_router(voice.router)


@app.get("/health")
def health():
    try:
        with db.conn() as c:
            c.execute("SELECT 1").fetchone()
        db_status = "ok"
    except Exception:  # noqa: BLE001 - health must report, not raise
        db_status = "error"
    return {"status": "ok", "db": db_status}


db.init()
