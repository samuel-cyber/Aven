"""Shared test isolation: force a hermetic, offline config.

``app.config`` calls ``load_dotenv()`` at import time, so a developer's real
``backend/.env`` (with a live ``WEBHOOK_SECRET`` and BimpeAI credentials) leaks
into the test process and breaks the offline suite with 401s and unexpected
"configured" states.

This autouse fixture neutralises every env-derived value before each test.
Tests that need a value set request their own fixture (e.g. ``configured``),
which runs *after* this one and overrides it.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402


@pytest.fixture(autouse=True)
def offline_config(monkeypatch):
    """Reset env-derived config to offline defaults for every test."""
    # Webhook: no shared secret -> header check is skipped.
    monkeypatch.setattr(config, "WEBHOOK_SECRET", "")

    # BimpeAI: unconfigured -> voice layer stubs instead of calling out.
    monkeypatch.setattr(config, "BIMPEAI_API_KEY", "")
    monkeypatch.setattr(config, "BIMPEAI_AGENT_ID", "")
    monkeypatch.setattr(config, "BIMPEAI_PHONE_NUMBER", "")
    monkeypatch.setattr(config, "BIMPEAI_IS_TEST_CALL", True)
    monkeypatch.setattr(config, "BIMPEAI_BASE_URL", "https://api.bimpe.ai")
    monkeypatch.setattr(config, "BIMPEAI_API_PATH", "/api/v1/console")
    monkeypatch.setattr(config, "BIMPEAI_TEST_DESTINATION", "test")

    # LLM: no key -> extraction falls back (tests monkeypatch the LLM anyway).
    monkeypatch.setattr(config, "LLM_API_KEY", "")

    yield
