"""
ConnectorRegistry — maps sessions to the right accounting platform connector.

Today this always returns XeroConnector. When a second connector is added,
the registry will:
  1. Check the platform_connections table for the session's active platform
  2. Instantiate the appropriate connector class
  3. Fall back to Xero (the default/first connector) if no explicit choice

The registry is the single point of dispatch — the agent, tools, and API
layer all call get_connector(session_id) and get back an AccountingConnector
instance. They never import a specific connector directly.
"""

from __future__ import annotations

from src.services.connectors.base import AccountingConnector, ConnectorInfo
from src.services.connectors.xero import XeroConnector
from src.services.logging import get_logger

log = get_logger("sikizana.connectors")

# All registered connector classes, keyed by platform name.
# When adding a new connector, import it and add it here.
_REGISTRY: dict[str, type[AccountingConnector]] = {
    "xero": XeroConnector,
}

# The default platform when a session has no explicit connection.
# This is the platform the app was built on and the one demo mode uses.
_DEFAULT_PLATFORM = "xero"


def list_available_platforms() -> list[ConnectorInfo]:
    """Return metadata for all registered connectors — used by the UI to
    show available integrations."""
    return [cls.info() for cls in _REGISTRY.values()]


def get_active_platform(session_id: str) -> str:
    """Determine which platform this session is connected to.

    Checks the platform_connections table for an explicit connection.
    Falls back to the default platform (xero) if none.

    When a session has connections to multiple platforms, the most recently
    connected one wins.
    """
    try:
        from src.services.payment_store import get_active_platform_connection

        conn = get_active_platform_connection(session_id)
        if conn and conn.get("platform") in _REGISTRY:
            return conn["platform"]
    except Exception:
        pass  # Table may not exist yet during migration

    return _DEFAULT_PLATFORM


def get_connector(session_id: str) -> AccountingConnector:
    """Return the appropriate connector instance for this session.

    This is the main entry point — the agent, tools, and API layer call
    this instead of instantiating XeroService directly.

    The connector is instantiated fresh each call (it's lightweight —
    just stores the session_id and a reference to the underlying service).
    """
    platform = get_active_platform(session_id)
    connector_cls = _REGISTRY.get(platform, _REGISTRY[_DEFAULT_PLATFORM])
    return connector_cls(session_id)
