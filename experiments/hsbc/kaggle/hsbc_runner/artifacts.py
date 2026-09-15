"""Atomic, deterministic run-artifact writing."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


def write_run_artifacts(run_directory: Path, artifacts: dict[str, Any]) -> None:
    if run_directory.exists():
        raise FileExistsError(f"Run directory already exists: {run_directory}")
    run_directory.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=run_directory.parent, prefix=".staging-") as staging:
        staging_path = Path(staging)
        for filename, content in artifacts.items():
            (staging_path / filename).write_text(
                json.dumps(content, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
        staging_path.rename(run_directory)
