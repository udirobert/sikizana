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
    test_limit: int = 1000
    min_test_fraud_cases: int = 10
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


def bounded_temporal_test_sample(
    temporal_test: pd.DataFrame, config: QSVCDataConfig
) -> pd.DataFrame:
    """Take the earliest bounded portion of an already temporally held-out set."""
    sample = temporal_test.sort_values("Time", kind="stable").head(config.test_limit).copy()
    fraud_count = int(sample["Class"].sum())
    if fraud_count < config.min_test_fraud_cases:
        raise ValueError(
            "QSVC test sample has insufficient fraud cases: "
            f"{fraud_count} < {config.min_test_fraud_cases}"
        )
    return sample


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
        "test_rows": len(test),
        "test_fraud_count": int(test["Class"].sum()),
        "test_fraud_prevalence": float(test["Class"].mean()),
        "features": feature_names,
        "qubits": len(feature_names),
        "feature_map_reps": config.feature_map_reps,
        "entanglement": config.entanglement,
        "max_train_kernel_entries": len(train) ** 2,
        "max_test_train_kernel_entries": len(train) * len(test),
    }
