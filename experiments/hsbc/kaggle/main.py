"""Kaggle entry point for the canonical HSBC Phase 1 runner.

Before submitting, set SIKIZANA_REPO_REF below to a pushed commit containing
this workstream. Kaggle mounts the ULB source read-only and downloads only
compact JSON artifacts through kernel output.
"""

from __future__ import annotations

import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

REPOSITORY_URL = "https://github.com/udirobert/sikizana.git"
SIKIZANA_REPO_REF = "REPLACE_WITH_PUSHED_COMMIT_SHA"
DATASET_PATH = Path("/kaggle/input/creditcardfraud/creditcard.csv")
OUTPUT_ROOT = Path("/kaggle/working/data/hsbc/runs")


def run(command: list[str], cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def main() -> None:
    if SIKIZANA_REPO_REF == "REPLACE_WITH_PUSHED_COMMIT_SHA":
        raise RuntimeError(
            "Set SIKIZANA_REPO_REF to the pushed commit containing the HSBC workstream."
        )
    if not DATASET_PATH.is_file():
        raise FileNotFoundError(f"Expected Kaggle dataset input is absent: {DATASET_PATH}")

    checkout = Path("/kaggle/working/sikizana")
    run(["git", "clone", "--no-checkout", REPOSITORY_URL, str(checkout)])
    run(["git", "checkout", "--detach", SIKIZANA_REPO_REF], cwd=checkout)
    run([sys.executable, "-m", "pip", "install", "--quiet", "-e", ".[hsbc]"], cwd=checkout)

    run_id = f"phase1-kaggle-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    run(
        [
            sys.executable,
            "-m",
            "src.hsbc.run_phase1",
            "--input",
            str(DATASET_PATH),
            "--run-id",
            run_id,
            "--output-root",
            str(OUTPUT_ROOT),
        ],
        cwd=checkout,
    )
    print(f"Artifacts: {OUTPUT_ROOT / run_id}")


if __name__ == "__main__":
    main()
