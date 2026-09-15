"""ULB dataset loading and input provenance helpers."""

from __future__ import annotations

from hashlib import sha256
from pathlib import Path

import pandas as pd

FEATURE_COLUMNS = ["Time", *[f"V{index}" for index in range(1, 29)], "Amount"]
REQUIRED_COLUMNS = [*FEATURE_COLUMNS, "Class"]


class DatasetValidationError(ValueError):
    """Raised when the input is not the expected ULB fraud dataset shape."""


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_ulb_dataset(path: str | Path) -> pd.DataFrame:
    dataset_path = Path(path)
    if not dataset_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    frame = pd.read_csv(dataset_path)
    if frame.columns.duplicated().any():
        raise DatasetValidationError("Dataset has duplicate column names")
    missing = sorted(set(REQUIRED_COLUMNS).difference(frame.columns))
    if missing:
        raise DatasetValidationError(f"Dataset is missing required columns: {missing}")
    if frame[REQUIRED_COLUMNS].isna().any().any():
        raise DatasetValidationError("Dataset has missing values in required columns")
    classes = set(frame["Class"].unique())
    if not classes.issubset({0, 1}) or len(classes) != 2:
        raise DatasetValidationError("Class must contain both binary labels 0 and 1")
    return frame.loc[:, REQUIRED_COLUMNS].copy()


def dataset_facts(frame: pd.DataFrame) -> dict[str, int | float | list[str]]:
    class_counts = frame["Class"].value_counts().to_dict()
    return {
        "row_count": len(frame),
        "feature_columns": FEATURE_COLUMNS,
        "legitimate_count": int(class_counts.get(0, 0)),
        "fraud_count": int(class_counts.get(1, 0)),
        "fraud_prevalence": float(frame["Class"].mean()),
    }
