"""Offline Kaggle entry point for the HSBC Phase 1 baseline.

Kaggle may disable outbound DNS even when Internet access is requested. This
bundle therefore vendors a pinned snapshot of the canonical Phase 1 runner and
uses Kaggle's managed pandas, scikit-learn, and XGBoost environment.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from hsbc_runner.config import Phase1Config
from hsbc_runner.run_phase1 import SOURCE_REVISION, run

INPUT_ROOT = Path("/kaggle/input")
OUTPUT_ROOT = Path("/kaggle/working/data/hsbc/runs")


def mounted_dataset_path() -> Path:
    """Find the ULB CSV without depending on Kaggle's mount-folder alias."""
    matches = sorted(INPUT_ROOT.rglob("creditcard.csv")) if INPUT_ROOT.is_dir() else []
    if len(matches) != 1:
        raise FileNotFoundError(
            "Expected exactly one mounted ULB creditcard.csv; "
            f"found {len(matches)} under {INPUT_ROOT}: {matches}"
        )
    return matches[0]


def main() -> None:
    run_id = f"phase1-kaggle-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    run_directory = run(
        mounted_dataset_path(), run_id, OUTPUT_ROOT, Phase1Config()
    )
    print(f"Source revision: {SOURCE_REVISION}")
    print(f"Artifacts: {run_directory}")


if __name__ == "__main__":
    main()
