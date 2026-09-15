"""Canonical bounded QSVC simulator comparison for HSBC Phase 2a."""

from __future__ import annotations

import argparse
import platform
import subprocess
import sys
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from time import perf_counter
from typing import Any

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from .artifacts import write_run_artifacts
from .config import Phase1Config
from .data import dataset_facts, file_sha256, load_ulb_dataset
from .evaluate import classification_facts, select_f1_threshold
from .features import select_top_features
from .models import logistic_baseline, training_scale_pos_weight, xgboost_baseline
from .quantum_data import (
    QSVCDataConfig,
    bounded_feasibility_sample,
    bounded_temporal_case_control_sample,
    fit_quantum_scaler,
    quantum_data_facts,
)
from .quantum_models import qsvc_simulator, quantum_model_facts
from .splits import temporal_train_validation_test

DATASET_URL = "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud"
DATASET_LICENSE = "Database Contents License (DbCL) 1.0; verify current Kaggle terms before publication"


def _git_revision() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=False
    )
    return result.stdout.strip() if result.returncode == 0 else None


def _decision_scores(model: Any, features, labels, validation_features):
    model.fit(features, labels)
    validation_scores = model.decision_function(validation_features)
    return model, validation_scores


def _evaluate_decision_model(
    model: Any, train, validation, test, feature_names: list[str]
) -> dict[str, Any]:
    fitted, validation_scores = _decision_scores(
        model, train[feature_names], train["Class"], validation[feature_names]
    )
    threshold = select_f1_threshold(validation["Class"], validation_scores)
    test_scores = fitted.decision_function(test[feature_names])
    return classification_facts(test["Class"], test_scores, threshold)


def _evaluate_probability_model(
    model: Any, train, validation, test, feature_names: list[str]
) -> dict[str, Any]:
    model.fit(train[feature_names], train["Class"])
    threshold = select_f1_threshold(
        validation["Class"], model.predict_proba(validation[feature_names])[:, 1]
    )
    return classification_facts(
        test["Class"], model.predict_proba(test[feature_names])[:, 1], threshold
    )


def run(
    input_path: Path,
    run_id: str,
    output_root: Path,
    *,
    feature_count: int = 8,
    qsvc_config: QSVCDataConfig = QSVCDataConfig(),
) -> Path:
    """Run QSVC and classical controls on one frozen Phase 2a data regime."""
    frame = load_ulb_dataset(input_path)
    phase1_config = Phase1Config(seed=qsvc_config.seed)
    train, validation, temporal_test = temporal_train_validation_test(frame, phase1_config)

    feature_selector = xgboost_baseline(
        qsvc_config.seed, training_scale_pos_weight(train["Class"])
    )
    feature_selector.fit(train.drop(columns="Class"), train["Class"])
    selected_features = select_top_features(
        feature_selector, list(train.drop(columns="Class").columns), feature_count
    )
    qsvc_train = bounded_feasibility_sample(train, qsvc_config)
    qsvc_validation = bounded_temporal_case_control_sample(validation, qsvc_config)
    qsvc_test = bounded_temporal_case_control_sample(temporal_test, qsvc_config)
    scaler = fit_quantum_scaler(qsvc_train, selected_features)
    scaled_train = qsvc_train.copy()
    scaled_validation = qsvc_validation.copy()
    scaled_test = qsvc_test.copy()
    scaled_train[selected_features] = scaler.transform(qsvc_train[selected_features])
    scaled_validation[selected_features] = scaler.transform(qsvc_validation[selected_features])
    scaled_test[selected_features] = scaler.transform(qsvc_test[selected_features])

    started = perf_counter()
    qsvc_metrics = _evaluate_decision_model(
        qsvc_simulator(
            feature_count,
            reps=qsvc_config.feature_map_reps,
            entanglement=qsvc_config.entanglement,
            seed=qsvc_config.seed,
        ),
        scaled_train,
        scaled_validation,
        scaled_test,
        selected_features,
    )
    qsvc_seconds = perf_counter() - started
    rbf_metrics = _evaluate_decision_model(
        Pipeline([("scale", StandardScaler()), ("model", SVC(kernel="rbf"))]),
        qsvc_train,
        qsvc_validation,
        qsvc_test,
        selected_features,
    )
    linear_metrics = _evaluate_probability_model(
        logistic_baseline(qsvc_config.seed),
        qsvc_train,
        qsvc_validation,
        qsvc_test,
        selected_features,
    )
    xgboost_metrics = _evaluate_probability_model(
        xgboost_baseline(
            qsvc_config.seed, training_scale_pos_weight(qsvc_train["Class"])
        ),
        qsvc_train,
        qsvc_validation,
        qsvc_test,
        selected_features,
    )

    workload = quantum_data_facts(qsvc_train, qsvc_test, selected_features, qsvc_config)
    facts = {
        "selected_features": selected_features,
        "models": {
            "qsvc": qsvc_metrics,
            "rbf_svc": rbf_metrics,
            "logistic": linear_metrics,
            "xgboost": xgboost_metrics,
        },
        "quantum": {
            **quantum_model_facts(
                feature_count,
                reps=qsvc_config.feature_map_reps,
                entanglement=qsvc_config.entanglement,
                seed=qsvc_config.seed,
            ),
            **workload,
            "qsvc_wall_clock_seconds": qsvc_seconds,
        },
        "gates": {
            "evaluation_fraud_cases": qsvc_config.evaluation_fraud_cases,
            "validation_case_control_passed": int(qsvc_validation["Class"].sum()) == qsvc_config.evaluation_fraud_cases,
            "test_case_control_passed": int(qsvc_test["Class"].sum()) == qsvc_config.evaluation_fraud_cases,
            "all_controls_completed": True,
        },
    }
    meta = {
        "run_id": run_id,
        "created_at_utc": datetime.now(UTC).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "git_revision": _git_revision(),
        "qsvc_config": qsvc_config.__dict__,
        "feature_count": feature_count,
        "packages": {name: version(name) for name in ("pandas", "scikit-learn", "xgboost", "qiskit", "qiskit-machine-learning")},
    }
    provenance = {
        "input_path": str(input_path),
        "sha256": file_sha256(input_path),
        "dataset_url": DATASET_URL,
        "license": DATASET_LICENSE,
        "input_facts": dataset_facts(frame),
    }
    run_directory = output_root / run_id
    write_run_artifacts(run_directory, {"meta.json": meta, "facts.json": facts, "provenance.json": provenance})
    return run_directory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output-root", default=Path("data/hsbc/runs"), type=Path)
    parser.add_argument("--features", choices=(8, 10), default=8, type=int)
    parser.add_argument("--train-size", default=256, type=int)
    parser.add_argument("--evaluation-size", default=1000, type=int)
    parser.add_argument("--evaluation-frauds", default=10, type=int)
    arguments = parser.parse_args()
    config = QSVCDataConfig(
        train_size=arguments.train_size,
        evaluation_size=arguments.evaluation_size,
        evaluation_fraud_cases=arguments.evaluation_frauds,
    )
    output = run(arguments.input, arguments.run_id, arguments.output_root, feature_count=arguments.features, qsvc_config=config)
    print(f"Phase 2a artifacts written to {output}")


if __name__ == "__main__":
    main()
