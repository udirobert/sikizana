"""Verify Kaggle Phase 2a QSVC runtime prerequisites without training."""

from __future__ import annotations

import importlib
import json
import platform
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

PACKAGES = ("qiskit", "qiskit-aer", "qiskit-machine-learning", "xgboost")


def package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def main() -> None:
    modules = {
        name: importlib.util.find_spec(name.replace("-", "_")) is not None
        for name in PACKAGES
    }
    input_root = Path("/kaggle/input")
    csv_paths = sorted(str(path) for path in input_root.rglob("creditcard.csv"))
    facts = {
        "python": sys.version,
        "platform": platform.platform(),
        "packages": {name: package_version(name) for name in PACKAGES},
        "modules_available": modules,
        "creditcard_csv_paths": csv_paths,
        "ready_for_qsvc": all(modules[name] for name in ("qiskit", "qiskit-aer", "qiskit-machine-learning", "xgboost")) and len(csv_paths) == 1,
    }
    Path("/kaggle/working/qsvc-environment-probe.json").write_text(
        json.dumps(facts, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(facts, sort_keys=True))


if __name__ == "__main__":
    main()
