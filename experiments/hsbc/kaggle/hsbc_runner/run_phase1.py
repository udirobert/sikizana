"""Offline Kaggle snapshot of the canonical HSBC Phase 1 runner."""

from __future__ import annotations

import platform
import sys
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

from .artifacts import write_run_artifacts
from .config import Phase1Config
from .data import FEATURE_COLUMNS, dataset_facts, file_sha256, load_ulb_dataset
from .evaluate import classification_facts, relative_degradation, select_f1_threshold
from .features import feature_importance_facts, select_top_features
from .models import logistic_baseline, training_scale_pos_weight, xgboost_baseline
from .splits import feasibility_sample, native_ratio_sample, temporal_train_validation_test

DATASET_URL = "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud"
DATASET_LICENSE = "Database Contents License (DbCL) 1.0; verify current Kaggle terms before publication"
SOURCE_REVISION = "2768dffc22c53ace429a21cc754d279531bf2687"


def _fit_and_evaluate(model: object, train, validation, test, features: list[str]) -> dict:
    model.fit(train[features], train["Class"])
    validation_scores = model.predict_proba(validation[features])[:, 1]
    threshold = select_f1_threshold(validation["Class"], validation_scores)
    test_scores = model.predict_proba(test[features])[:, 1]
    return classification_facts(test["Class"], test_scores, threshold)


def run(input_path: Path, run_id: str, output_root: Path, config: Phase1Config) -> Path:
    frame = load_ulb_dataset(input_path)
    train, validation, test = temporal_train_validation_test(frame, config)
    weight = training_scale_pos_weight(train["Class"])

    full_xgboost = xgboost_baseline(config.seed, weight)
    full_xgboost_metrics = _fit_and_evaluate(
        full_xgboost, train, validation, test, FEATURE_COLUMNS
    )
    linear_metrics = _fit_and_evaluate(
        logistic_baseline(config.seed), train, validation, test, FEATURE_COLUMNS
    )
    selected_features = select_top_features(
        full_xgboost, FEATURE_COLUMNS, config.top_feature_count
    )

    native = native_ratio_sample(train, config)
    feasibility = feasibility_sample(train, config)
    reduced_xgboost_metrics = _fit_and_evaluate(
        xgboost_baseline(config.seed, training_scale_pos_weight(feasibility["Class"])),
        feasibility,
        validation,
        test,
        selected_features,
    )
    degradation = relative_degradation(
        full_xgboost_metrics["auprc"], reduced_xgboost_metrics["auprc"]
    )
    test_fraud_count = int(test["Class"].sum())
    passed = (
        degradation <= config.max_auprc_relative_degradation
        and test_fraud_count >= config.min_test_fraud_cases
    )

    run_directory = output_root / run_id
    meta = {
        "run_id": run_id,
        "created_at_utc": datetime.now(UTC).isoformat(),
        "config": config.to_dict(),
        "python": sys.version,
        "platform": platform.platform(),
        "source_revision": SOURCE_REVISION,
        "execution_mode": "offline_kaggle_snapshot",
        "packages": {
            name: version(name) for name in ("pandas", "scikit-learn", "xgboost")
        },
    }
    provenance = {
        "input_path": str(input_path),
        "sha256": file_sha256(input_path),
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
            "passed": passed,
        },
    }
    write_run_artifacts(
        run_directory,
        {"meta.json": meta, "provenance.json": provenance, "facts.json": facts},
    )
    return run_directory
