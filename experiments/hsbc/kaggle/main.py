"""Self-contained offline Kaggle entry point for the HSBC Phase 1 baseline.

Kaggle uploads the declared script but not sibling Python packages. This file
therefore contains the pinned canonical Phase 1 implementation and runs with
Kaggle's managed pandas, scikit-learn, and XGBoost environment.
"""

from __future__ import annotations

import json
import platform
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from hashlib import sha256
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

SOURCE_REVISION = "2768dffc22c53ace429a21cc754d279531bf2687"
DATASET_URL = "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud"
DATASET_LICENSE = (
    "Database Contents License (DbCL) 1.0; "
    "verify current Kaggle terms before publication"
)
INPUT_ROOT = Path("/kaggle/input")
OUTPUT_ROOT = Path("/kaggle/working/data/hsbc/runs")
FEATURE_COLUMNS = ["Time", *[f"V{index}" for index in range(1, 29)], "Amount"]
REQUIRED_COLUMNS = [*FEATURE_COLUMNS, "Class"]


@dataclass(frozen=True)
class Phase1Config:
    seed: int = 2026
    temporal_test_fraction: float = 0.20
    validation_fraction: float = 0.20
    top_feature_count: int = 10
    native_sample_size: int = 1500
    feasibility_max_fraud: int = 250
    feasibility_legitimate_per_fraud: int = 4
    max_auprc_relative_degradation: float = 0.15
    min_test_fraud_cases: int = 25

    def to_dict(self) -> dict[str, int | float]:
        return asdict(self)


def mounted_dataset_path() -> Path:
    """Find the ULB CSV without depending on Kaggle's mount-folder alias."""
    matches = sorted(INPUT_ROOT.rglob("creditcard.csv")) if INPUT_ROOT.is_dir() else []
    if len(matches) != 1:
        raise FileNotFoundError(
            "Expected exactly one mounted ULB creditcard.csv; "
            f"found {len(matches)} under {INPUT_ROOT}: {matches}"
        )
    return matches[0]


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_ulb_dataset(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    if frame.columns.duplicated().any():
        raise ValueError("Dataset has duplicate column names")
    missing = sorted(set(REQUIRED_COLUMNS).difference(frame.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")
    if frame[REQUIRED_COLUMNS].isna().any().any():
        raise ValueError("Dataset has missing values in required columns")
    classes = set(frame["Class"].unique())
    if not classes.issubset({0, 1}) or len(classes) != 2:
        raise ValueError("Class must contain both binary labels 0 and 1")
    return frame.loc[:, REQUIRED_COLUMNS].copy()


def dataset_facts(frame: pd.DataFrame) -> dict[str, int | float | list[str]]:
    counts = frame["Class"].value_counts().to_dict()
    return {
        "row_count": len(frame),
        "feature_columns": FEATURE_COLUMNS,
        "legitimate_count": int(counts.get(0, 0)),
        "fraud_count": int(counts.get(1, 0)),
        "fraud_prevalence": float(frame["Class"].mean()),
    }


def temporal_train_validation_test(
    frame: pd.DataFrame, config: Phase1Config
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    ordered = frame.sort_values("Time", kind="stable").reset_index(drop=True)
    test_start = int(len(ordered) * (1 - config.temporal_test_fraction))
    training_pool, test = ordered.iloc[:test_start], ordered.iloc[test_start:]
    train, validation = train_test_split(
        training_pool,
        test_size=config.validation_fraction,
        random_state=config.seed,
        stratify=training_pool["Class"],
    )
    return train.copy(), validation.copy(), test.copy()


def native_ratio_sample(train: pd.DataFrame, config: Phase1Config) -> pd.DataFrame:
    size = min(config.native_sample_size, len(train))
    fraud_count = min(
        len(train.loc[train["Class"] == 1]),
        int(round(size * train["Class"].mean())),
    )
    legitimate = train.loc[train["Class"] == 0]
    legitimate_count = min(len(legitimate), size - fraud_count)
    fraud_count = size - legitimate_count
    sampled_fraud = train.loc[train["Class"] == 1].sample(
        n=fraud_count, random_state=config.seed
    )
    sampled_legitimate = legitimate.sample(
        n=legitimate_count, random_state=config.seed
    )
    return pd.concat([sampled_fraud, sampled_legitimate]).sample(
        frac=1, random_state=config.seed
    ).reset_index(drop=True)


def feasibility_sample(train: pd.DataFrame, config: Phase1Config) -> pd.DataFrame:
    fraud = train.loc[train["Class"] == 1]
    legitimate = train.loc[train["Class"] == 0]
    fraud_count = min(len(fraud), config.feasibility_max_fraud)
    if fraud_count == 0:
        raise ValueError("Feasibility sample requires at least one fraud example")
    sampled_fraud = fraud.sample(n=fraud_count, random_state=config.seed)
    sampled_legitimate = legitimate.sample(
        n=min(len(legitimate), fraud_count * config.feasibility_legitimate_per_fraud),
        random_state=config.seed,
    )
    return pd.concat([sampled_fraud, sampled_legitimate]).sample(
        frac=1, random_state=config.seed
    ).reset_index(drop=True)


def training_scale_pos_weight(labels: pd.Series) -> float:
    positives = int(labels.sum())
    if positives == 0:
        raise ValueError("Training labels must include fraud examples")
    return (len(labels) - positives) / positives


def xgboost_baseline(seed: int, scale_pos_weight: float) -> XGBClassifier:
    return XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="aucpr",
        random_state=seed,
        n_jobs=1,
        scale_pos_weight=scale_pos_weight,
    )


def select_top_features(
    model: XGBClassifier, feature_names: list[str], count: int
) -> list[str]:
    ranked = sorted(
        zip(feature_names, model.feature_importances_, strict=True),
        key=lambda pair: (-pair[1], pair[0]),
    )
    return [name for name, _ in ranked[:count]]


def feature_importance_facts(
    model: XGBClassifier, feature_names: list[str]
) -> list[dict[str, float | str]]:
    return [
        {"feature": name, "importance": float(importance)}
        for name, importance in sorted(
            zip(feature_names, model.feature_importances_, strict=True),
            key=lambda pair: (-pair[1], pair[0]),
        )
    ]


def select_f1_threshold(labels: Any, scores: Any) -> float:
    precision, recall, thresholds = precision_recall_curve(labels, scores)
    f1_values = 2 * precision[:-1] * recall[:-1] / np.clip(
        precision[:-1] + recall[:-1], 1e-12, None
    )
    return float(thresholds[int(np.nanargmax(f1_values))]) if len(thresholds) else 0.5


def classification_facts(labels: Any, scores: Any, threshold: float) -> dict[str, Any]:
    predicted = (np.asarray(scores) >= threshold).astype(int)
    matrix = confusion_matrix(labels, predicted, labels=[0, 1])
    return {
        "auc_roc": float(roc_auc_score(labels, scores)),
        "auprc": float(average_precision_score(labels, scores)),
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "precision": float(precision_score(labels, predicted, zero_division=0)),
        "recall": float(recall_score(labels, predicted, zero_division=0)),
        "threshold": threshold,
        "confusion_matrix": matrix.tolist(),
    }


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


def fit_and_evaluate(
    model: Any,
    train: pd.DataFrame,
    validation: pd.DataFrame,
    test: pd.DataFrame,
    features: list[str],
) -> dict[str, Any]:
    model.fit(train[features], train["Class"])
    threshold = select_f1_threshold(
        validation["Class"], model.predict_proba(validation[features])[:, 1]
    )
    return classification_facts(
        test["Class"], model.predict_proba(test[features])[:, 1], threshold
    )


def main() -> None:
    config = Phase1Config()
    frame = load_ulb_dataset(mounted_dataset_path())
    train, validation, test = temporal_train_validation_test(frame, config)
    weight = training_scale_pos_weight(train["Class"])

    full_xgboost = xgboost_baseline(config.seed, weight)
    full_xgboost_metrics = fit_and_evaluate(
        full_xgboost, train, validation, test, FEATURE_COLUMNS
    )
    linear_metrics = fit_and_evaluate(
        Pipeline(
            [
                ("scale", StandardScaler()),
                (
                    "model",
                    LogisticRegression(
                        class_weight="balanced",
                        max_iter=2000,
                        random_state=config.seed,
                        n_jobs=1,
                    ),
                ),
            ]
        ),
        train,
        validation,
        test,
        FEATURE_COLUMNS,
    )
    selected_features = select_top_features(
        full_xgboost, FEATURE_COLUMNS, config.top_feature_count
    )
    native = native_ratio_sample(train, config)
    feasibility = feasibility_sample(train, config)
    reduced_xgboost_metrics = fit_and_evaluate(
        xgboost_baseline(
            config.seed, training_scale_pos_weight(feasibility["Class"])
        ),
        feasibility,
        validation,
        test,
        selected_features,
    )

    degradation = (
        full_xgboost_metrics["auprc"] - reduced_xgboost_metrics["auprc"]
    ) / full_xgboost_metrics["auprc"]
    test_fraud_count = int(test["Class"].sum())
    run_id = f"phase1-kaggle-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    run_directory = OUTPUT_ROOT / run_id
    meta = {
        "run_id": run_id,
        "created_at_utc": datetime.now(UTC).isoformat(),
        "config": config.to_dict(),
        "python": sys.version,
        "platform": platform.platform(),
        "source_revision": SOURCE_REVISION,
        "execution_mode": "self_contained_kaggle_script",
        "packages": {
            name: version(name) for name in ("pandas", "scikit-learn", "xgboost")
        },
    }
    provenance = {
        "input_path": str(mounted_dataset_path()),
        "sha256": file_sha256(mounted_dataset_path()),
        "dataset_url": DATASET_URL,
        "license": DATASET_LICENSE,
        "input_facts": dataset_facts(frame),
    }
    facts = {
        "split_counts": {
            "train": len(train), "validation": len(validation), "test": len(test)
        },
        "test_fraud_count": test_fraud_count,
        "class_weighting": {
            "xgboost_scale_pos_weight": weight, "linear": "balanced"
        },
        "models": {
            "xgboost_full": full_xgboost_metrics,
            "logistic_full": linear_metrics,
            "xgboost_reduced_feasibility": reduced_xgboost_metrics,
        },
        "selected_features": selected_features,
        "feature_importances": feature_importance_facts(full_xgboost, FEATURE_COLUMNS),
        "samples": {
            "native_ratio": dataset_facts(native),
            "feasibility": dataset_facts(feasibility),
        },
        "gate": {
            "metric": "auprc",
            "full_reference": full_xgboost_metrics["auprc"],
            "reduced_candidate": reduced_xgboost_metrics["auprc"],
            "relative_degradation": degradation,
            "maximum_relative_degradation": config.max_auprc_relative_degradation,
            "minimum_test_fraud_cases": config.min_test_fraud_cases,
            "passed": (
                degradation <= config.max_auprc_relative_degradation
                and test_fraud_count >= config.min_test_fraud_cases
            ),
        },
    }
    write_run_artifacts(
        run_directory,
        {"meta.json": meta, "provenance.json": provenance, "facts.json": facts},
    )
    print(f"Source revision: {SOURCE_REVISION}")
    print(f"Artifacts: {run_directory}")


if __name__ == "__main__":
    main()
