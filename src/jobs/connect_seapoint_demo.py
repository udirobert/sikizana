"""Point a session at the Seapoint connector for the hackathon demo.

Records a platform_connections row so get_active_platform() resolves the
session to "seapoint" — the real dispatch path, no escape hatch. Revocable
with `disconnect_platform_connection(session_id, platform="seapoint")`.

Usage:

    SEAPOINT_ENABLED=1 python -m src.jobs.connect_seapoint_demo <session_id>
"""

from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python -m src.jobs.connect_seapoint_demo <session_id>")
        return 2

    session_id = sys.argv[1]

    from src.services.connectors import list_available_platforms
    from src.services.payment_store import record_platform_connection

    if "seapoint" not in {p.platform for p in list_available_platforms()}:
        print("seapoint is not registered — set SEAPOINT_ENABLED=1 first")
        return 1

    record_platform_connection(
        session_id,
        platform="seapoint",
        tenant_id="seapoint-sandbox",
        tenant_name="Seapoint sandbox",
    )
    print(f"session {session_id} → platform 'seapoint' (sandbox)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
