"""Self-contained offline Kaggle runner for the bounded HSBC Phase 2a QSVC test."""

from __future__ import annotations

import json
import platform
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from hashlib import sha256
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from typing import Any

INPUT_ROOT = Path("/kaggle/input")
OUTPUT_ROOT = Path("/kaggle/working/data/hsbc/runs")
WHEEL_DATASET_SLUG = "hsbc-qsvc-offline-wheels"
SOURCE_REVISION = "ed0477ed"
DATASET_URL = "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud"
DATASET_LICENSE = "Database Contents License (DbCL) 1.0; verify current Kaggle terms before publication"
FEATURE_COLUMNS = ["Time", *[f"V{index}" for index in range(1, 29)], "Amount"]
REQUIRED_COLUMNS = [*FEATURE_COLUMNS, "Class"]


@dataclass(frozen=True)
class QSVCConfig:
    seed: int = 2026
    temporal_test_fraction: float = 0.20
    validation_fraction: float = 0.20
    feature_count: int = 8
    train_size: int = 64
    evaluation_size: int = 200
    evaluation_fraud_cases: int = 10
    legitimate_per_fraud: int = 4
    feature_map_reps: int = 2
    entanglement: str = "linear"
    shots: int = 1024

    def to_dict(self) -> dict[str, int | float | str]:
        return asdict(self)


def mounted_path(filename: str, *, expected_count: int = 1) -> Path:
    matches = sorted(INPUT_ROOT.rglob(filename)) if INPUT_ROOT.is_dir() else []
    if len(matches) != expected_count:
        raise FileNotFoundError(f"Expected {expected_count} {filename!r} under {INPUT_ROOT}, found {matches}")
    return matches[0]


def wheel_directory() -> Path:
    matches = sorted(path for path in INPUT_ROOT.rglob("wheels") if path.is_dir())
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected one mounted offline wheel directory, found {matches}")
    return matches[0]


def install_offline_qiskit() -> None:
    wheels = wheel_directory()
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--quiet",
            "--no-index",
            "--find-links",
            str(wheels),
            "qiskit==2.3.1",
            "qiskit-aer==0.17.2",
            "qiskit-machine-learning==0.9.1",
        ],
        check=True,
    )


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_dataset(path: Path):
    import pandas as pd

    frame = pd.read_csv(path)
    missing = sorted(set(REQUIRED_COLUMNS).difference(frame.columns))
    if frame.columns.duplicated().any() or missing:
        raise ValueError(f"Invalid ULB schema; missing={missing}")
    if frame[REQUIRED_COLUMNS].isna().any().any() or set(frame["Class"].unique()) != {0, 1}:
        raise ValueError("ULB data must have complete binary labels")
    return frame.loc[:, REQUIRED_COLUMNS].copy()


def temporal_split(frame, config: QSVCConfig):
    from sklearn.model_selection import train_test_split

    ordered = frame.sort_values("Time", kind="stable").reset_index(drop=True)
    test_start = int(len(ordered) * (1 - config.temporal_test_fraction))
    pool, test = ordered.iloc[:test_start], ordered.iloc[test_start:]
    train, validation = train_test_split(
        pool,
        test_size=config.validation_fraction,
        random_state=config.seed,
        stratify=pool["Class"],
    )
    return train.copy(), validation.copy(), test.copy()


def case_control(frame, *, rows: int, frauds: int, seed: int):
    import pandas as pd

    positives = frame.loc[frame["Class"] == 1]
    negatives = frame.loc[frame["Class"] == 0]
    if len(positives) < frauds or len(negatives) < rows - frauds:
        raise ValueError("Insufficient cases for the bounded case-control cohort")
    return pd.concat(
        [
            positives.sample(n=frauds, random_state=seed),
            negatives.sample(n=rows - frauds, random_state=seed),
        ]
    ).sample(frac=1, random_state=seed).reset_index(drop=True)


def qsvc_train_sample(frame, config: QSVCConfig):
    return case_control(
        frame,
        rows=config.train_size,
        frauds=config.train_size // (config.legitimate_per_fraud + 1),
        seed=config.seed,
    )


def scale_pos_weight(labels) -> float:
    positives = int(labels.sum())
    return (len(labels) - positives) / positives


def choose_threshold(labels, scores) -> float:
    import numpy as np
    from sklearn.metrics import precision_recall_curve

    precision, recall, thresholds = precision_recall_curve(labels, scores)
    values = 2 * precision[:-1] * recall[:-1] / np.clip(precision[:-1] + recall[:-1], 1e-12, None)
    return float(thresholds[int(np.nanargmax(values))]) if len(thresholds) else 0.5


def metrics(labels, scores, threshold: float) -> dict[str, Any]:
    import numpy as np
    from sklearn.metrics import average_precision_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score

    predicted = (np.asarray(scores) >= threshold).astype(int)
    return {
        "auc_roc": float(roc_auc_score(labels, scores)),
        "auprc": float(average_precision_score(labels, scores)),
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "precision": float(precision_score(labels, predicted, zero_division=0)),
        "recall": float(recall_score(labels, predicted, zero_division=0)),
        "threshold": threshold,
        "confusion_matrix": confusion_matrix(labels, predicted, labels=[0, 1]).tolist(),
    }


def decision_metrics(model, train, validation, test, features):
    model.fit(train[features], train["Class"])
    threshold = choose_threshold(validation["Class"], model.decision_function(validation[features]))
    return metrics(test["Class"], model.decision_function(test[features]), threshold)


def probability_metrics(model, train, validation, test, features):
    model.fit(train[features], train["Class"])
    threshold = choose_threshold(validation["Class"], model.predict_proba(validation[features])[:, 1])
    return metrics(test["Class"], model.predict_proba(test[features])[:, 1], threshold)


def write_artifacts(directory: Path, artifacts: dict[str, Any]) -> None:
    if directory.exists():
        raise FileExistsError(f"Run directory already exists: {directory}")
    directory.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=directory.parent, prefix=".staging-") as staging:
        stage = Path(staging)
        for name, content in artifacts.items():
            (stage / name).write_text(json.dumps(content, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        stage.rename(directory)


def main() -> None:
    install_offline_qiskit()
    import numpy as np
    from qiskit.circuit.library import zz_feature_map
    from qiskit.primitives import StatevectorSampler
    from qiskit_machine_learning.algorithms import QSVC
    from qiskit_machine_learning.kernels import FidelityQuantumKernel
    from qiskit_machine_learning.state_fidelities import ComputeUncompute
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import MinMaxScaler, StandardScaler
    from sklearn.svm import SVC
    from xgboost import XGBClassifier

    config = QSVCConfig()
    dataset_path = mounted_path("creditcard.csv")
    frame = load_dataset(dataset_path)
    train, validation, temporal_test = temporal_split(frame, config)

    selector = XGBClassifier(
        n_estimators=300, max_depth=5, learning_rate=0.05, subsample=0.8,
        colsample_bytree=0.8, eval_metric="aucpr", random_state=config.seed,
        n_jobs=1, scale_pos_weight=scale_pos_weight(train["Class"]),
    )
    selector.fit(train[FEATURE_COLUMNS], train["Class"])
    selected_features = [
        name for name, _ in sorted(
            zip(FEATURE_COLUMNS, selector.feature_importances_, strict=True),
            key=lambda item: (-item[1], item[0]),
        )[:config.feature_count]
    ]
    qtrain = qsvc_train_sample(train, config)
    qvalidation = case_control(validation, rows=config.evaluation_size, frauds=config.evaluation_fraud_cases, seed=config.seed)
    qtest = case_control(temporal_test, rows=config.evaluation_size, frauds=config.evaluation_fraud_cases, seed=config.seed)

    quantum_scaler = MinMaxScaler(feature_range=(0, 1)).fit(qtrain[selected_features])
    scaled_train, scaled_validation, scaled_test = qtrain.copy(), qvalidation.copy(), qtest.copy()
    for target, source in ((scaled_train, qtrain), (scaled_validation, qvalidation), (scaled_test, qtest)):
        target[selected_features] = quantum_scaler.transform(source[selected_features])

    feature_map = zz_feature_map(config.feature_count, reps=config.feature_map_reps, entanglement=config.entanglement)
    kernel = FidelityQuantumKernel(
        feature_map=feature_map,
        fidelity=ComputeUncompute(StatevectorSampler(default_shots=config.shots, seed=config.seed)),
    )
    started = perf_counter()
    qsvc_metrics = decision_metrics(QSVC(quantum_kernel=kernel), scaled_train, scaled_validation, scaled_test, selected_features)
    qsvc_seconds = perf_counter() - started
    rbf_metrics = decision_metrics(Pipeline([("scale", StandardScaler()), ("model", SVC(kernel="rbf"))]), qtrain, qvalidation, qtest, selected_features)
    logistic_metrics = probability_metrics(Pipeline([("scale", StandardScaler()), ("model", __import__("sklearn.linear_model", fromlist=["LogisticRegression"]).LogisticRegression(class_weight="balanced", max_iter=2000, random_state=config.seed, n_jobs=1))]), qtrain, qvalidation, qtest, selected_features)
    xgboost_metrics = probability_metrics(XGBClassifier(n_estimators=300, max_depth=5, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, eval_metric="aucpr", random_state=config.seed, n_jobs=1, scale_pos_weight=scale_pos_weight(qtrain["Class"])), qtrain, qvalidation, qtest, selected_features)

    run_id = f"phase2a-qsvc-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    run_directory = OUTPUT_ROOT / run_id
    input_counts = frame["Class"].value_counts().to_dict()
    artifacts = {
        "meta.json": {
            "run_id": run_id, "created_at_utc": datetime.now(UTC).isoformat(),
            "source_revision": SOURCE_REVISION, "execution_mode": "offline_wheels_kaggle_script",
            "config": config.to_dict(), "python": sys.version, "platform": platform.platform(),
            "packages": {name: version(name) for name in ("pandas", "scikit-learn", "xgboost", "qiskit", "qiskit-aer", "qiskit-machine-learning")},
        },
        "provenance.json": {
            "input_path": str(dataset_path), "sha256": file_sha256(dataset_path),
            "dataset_url": DATASET_URL, "license": DATASET_LICENSE,
            "input_facts": {"row_count": len(frame), "fraud_count": int(input_counts[1]), "legitimate_count": int(input_counts[0]), "fraud_prevalence": float(frame["Class"].mean())},
            "offline_wheel_dataset": "udingethe/hsbc-qsvc-offline-wheels",
        },
        "facts.json": {
            "selected_features": selected_features,
            "models": {"qsvc": qsvc_metrics, "rbf_svc": rbf_metrics, "logistic": logistic_metrics, "xgboost": xgboost_metrics},
            "quantum": {"algorithm": "QSVC", "kernel": "FidelityQuantumKernel", "feature_map": "ZZFeatureMap", "backend": "StatevectorSampler", "fidelity_estimation": "ComputeUncompute", "qubits": config.feature_count, "feature_map_reps": config.feature_map_reps, "entanglement": config.entanglement, "shots": config.shots, "seed": config.seed, "circuit_depth": feature_map.decompose().depth(), "train_rows": len(qtrain), "train_fraud_count": int(qtrain["Class"].sum()), "evaluation_rows": len(qtest), "evaluation_fraud_count": int(qtest["Class"].sum()), "evaluation_sampling": "case_control_temporal_holdout", "max_train_kernel_entries": len(qtrain) ** 2, "max_test_train_kernel_entries": len(qtrain) * len(qtest), "qsvc_wall_clock_seconds": qsvc_seconds},
            "gates": {"evaluation_fraud_cases": config.evaluation_fraud_cases, "validation_case_control_passed": int(qvalidation["Class"].sum()) == config.evaluation_fraud_cases, "test_case_control_passed": int(qtest["Class"].sum()) == config.evaluation_fraud_cases, "all_controls_completed": True},
        },
    }
    write_artifacts(run_directory, artifacts)
    print(f"Artifacts: {run_directory}")


if __name__ == "__main__":
    main()
