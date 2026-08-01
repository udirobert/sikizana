"""Shared per-request session context for agent tools.

The agent loop sets the current session before executing tools so every
tool reads/writes the books belonging to the caller — not a shared global
org. Kept in its own module so `accounting_tools`, `metric_snapshots`,
and any future tool group share one ContextVar (one `set_current_session`
call covers them all).
"""

from __future__ import annotations

from contextvars import ContextVar

from src.services.connectors import get_connector
from src.services.connectors.base import AccountingConnector

# Which user session the current tool call is acting for.
_current_session: ContextVar[str] = ContextVar("xero_session", default="default")


def set_current_session(session_id: str) -> None:
    _current_session.set(session_id)


def current_session() -> str:
    return _current_session.get()


def svc() -> AccountingConnector:
    """Connector bound to the active session (Xero today, others tomorrow)."""
    return get_connector(_current_session.get())
