"""
Shared fixtures. Every test runs against a throwaway SQLite database and
with live data sources (Xero CLI, OAuth) forced off, so the suite is
deterministic and can never touch a real Xero org.
"""

import pytest


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    import src.services.payment_store as payment_store
    import src.services.xero_oauth as xero_oauth

    monkeypatch.setattr(payment_store, "DB_PATH", db_path)
    monkeypatch.setattr(xero_oauth, "_DB_PATH", db_path)
    yield db_path


@pytest.fixture(autouse=True)
def force_demo_mode(monkeypatch):
    """Force XeroService into mock mode regardless of the host machine."""
    import src.services.xero_service as xero_service
    import src.services.xero_api as xero_api

    monkeypatch.setattr(xero_service, "_cli_available", lambda: False)
    monkeypatch.setattr(xero_api, "is_connected", lambda session_id: False)
    yield
