"""Central config: the only module allowed to read environment variables."""

import os

from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "aven.db")

# Shared secret for the BimpeAI webhook header check (optional).
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")

# LLM extraction (Anthropic-compatible). Empty key -> fallback extraction.
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-20250514")

# BimpeAI voice platform. Confirmed against docs.bimpe.ai and the official
# Python SDK (bimpeai 0.4.1): the Console REST API lives at
# {BIMPEAI_BASE_URL}{BIMPEAI_API_PATH} and is called in services/bimpeai.py.
BIMPEAI_API_KEY = os.getenv("BIMPEAI_API_KEY", "")
BIMPEAI_AGENT_ID = os.getenv("BIMPEAI_AGENT_ID", "")
BIMPEAI_PHONE_NUMBER = os.getenv("BIMPEAI_PHONE_NUMBER", "")
BIMPEAI_BASE_URL = os.getenv("BIMPEAI_BASE_URL", "https://api.bimpe.ai")
BIMPEAI_API_PATH = os.getenv("BIMPEAI_API_PATH", "/api/v1/console")

# True -> use BimpeAI test telephony (any destination works, no live channel
# needed). Set to "false" in .env once a live number is linked to the agent.
BIMPEAI_IS_TEST_CALL = os.getenv("BIMPEAI_IS_TEST_CALL", "true").lower() in ("1", "true", "yes")

# Destination sent for test calls. BimpeAI's test telephony accepts a
# placeholder; override if your agent expects a real number.
BIMPEAI_TEST_DESTINATION = os.getenv("BIMPEAI_TEST_DESTINATION", "test")

# How long the voice orchestrator waits for a call to end before giving up.
BIMPEAI_WAIT_TIMEOUT = int(os.getenv("BIMPEAI_WAIT_TIMEOUT", "240"))
BIMPEAI_POLL_INTERVAL = float(os.getenv("BIMPEAI_POLL_INTERVAL", "5"))
