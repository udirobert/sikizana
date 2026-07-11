"""
Accounting connector abstraction layer.

Defines the contract that any accounting platform connector must implement
(Xero, QuickBooks, Sage, FreeAgent, etc.) and a registry that dispatches
to the correct connector based on the user's connected platform.

This is the seam that makes Sikizana multi-platform ready. Today only
Xero is implemented, but the architecture supports adding more connectors
without touching the agent, tools, or API layer.

Design principles:
  - The agent and tools call through AccountingConnector, never XeroService
    directly.
  - Each connector is responsible for its own OAuth flow, token storage,
    and data normalization.
  - The registry resolves which connector to use based on the session's
    active platform connection.
  - Connector-agnostic data (chase sequences, memories, conversations)
    lives above this layer and is shared across all platforms.
"""

from src.services.connectors.base import AccountingConnector, ConnectorInfo
from src.services.connectors.registry import (
    get_connector,
    get_active_platform,
    list_available_platforms,
)

__all__ = [
    "AccountingConnector",
    "ConnectorInfo",
    "get_connector",
    "get_active_platform",
    "list_available_platforms",
]
