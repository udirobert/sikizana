"""Deterministic data preparation contracts for Phase 2a quantum kernels."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sklearn.preprocessing import MinMaxScaler


@dataclass(frozen=True)
class QSVCDataConfig:
    """Bounded Phase 2a sampling and encoding configuration."""

    seed: int = 2026
    train_size: int = 256
    evaluation_size: int = 1000
    evaluation_fraud_cases: int = 10
    legitimate_per_fraud: int = 4
    feature_map_reps: int = 2
    entanglement: str = "linear"


def bounded_feasibility_sample(
    frame: pd.DataFrame, config: QSVCDataConfig
) -> pd.DataFrame:
    """Draw an exact-size, fraud-enriched training sample with a fixed seed."""
    fraud = frame.loc[frame["Class"] == 1]
    legitimate = frame.loc[frame["Class"] == 0]
    desired_fraud = min(
        len(fraud), config.train_size // (config.legitimate_per_fraud + 1)
    )
    desired_legitimate = config.train_size - desired_fraud
    if desired_fraud == 0 or desired_legitimate > len(legitimate):
        raise ValueError("QSVC training sample cannot satisfy the configured class design")
    sampled = pd.concat(
        [
            fraud.sample(n=desired_fraud, random_state=config.seed),
            legitimate.sample(n=desired_legitimate, random_state=config.seed),
        ]
    )
    return sampled.sample(frac=1, random_state=config.seed).reset_index(drop=True)


def bounded_temporal_case_control_sample(
    temporal_partition: pd.DataFrame, config: QSVCDataConfig
) -> pd.DataFrame:
    """Draw a fixed case-control cohort from one already held-out temporal partition.

    The cohort preserves temporal partition membership but intentionally enriches
    fraud cases so AUPRC/F1 can be estimated at a bounded quantum-kernel cost.
    Its changed prevalence must never be presented as production prevalence.
    """
    fraud = temporal_partition.loc[temporal_partition["Class"] == 1]
    legitimate = temporal_partition.loc[temporal_partition["Class"] == 0]
    if len(fraud) < config.evaluation_fraud_cases:
        raise ValueError(
            "QSVC evaluation partition has insufficient fraud cases: "
            f"{len(fraud)} < {config.evaluation_fraud_cases}"
        )
    legitimate_count = config.evaluation_size - config.evaluation_fraud_cases
    if len(legitimate) < legitimate_count:
        raise ValueError("QSVC evaluation partition lacks legitimate examples")
    sample = pd.concat(
        [
            fraud.sample(n=config.evaluation_fraud_cases, random_state=config.seed),
            legitimate.sample(n=legitimate_count, random_state=config.seed),
        ]
    )
    return sample.sample(frac=1, random_state=config.seed).reset_index(drop=True)


def fit_quantum_scaler(train: pd.DataFrame, feature_names: list[str]) -> MinMaxScaler:
    """Fit the feature-map range scaler only on the QSVC training partition."""
    return MinMaxScaler(feature_range=(0, 1)).fit(train[feature_names])


def quantum_data_facts(
    train: pd.DataFrame, test: pd.DataFrame, feature_names: list[str], config: QSVCDataConfig
) -> dict[str, int | float | str | list[str]]:
    """Return the bounded workload facts required for Phase 2a review."""
    return {
        "train_rows": len(train),
        "train_fraud_count": int(train["Class"].sum()),
        "train_fraud_prevalence": float(train["Class"].mean()),
        "evaluation_rows": len(test),
        "evaluation_fraud_count": int(test["Class"].sum()),
        "evaluation_fraud_prevalence": float(test["Class"].mean()),
        "evaluation_sampling": "case_control_temporal_holdout",
        "features": feature_names,
        "qubits": len(feature_names),
        "feature_map_reps": config.feature_map_reps,
        "entanglement": config.entanglement,
        "max_train_kernel_entries": len(train) ** 2,
        "max_test_train_kernel_entries": len(train) * len(test),
    }
