import numpy as np
import pandas as pd
import pytest

from src.hsbc.data import FEATURE_COLUMNS
from src.hsbc.quantum_data import (
    QSVCDataConfig,
    bounded_feasibility_sample,
    bounded_temporal_case_control_sample,
    fit_quantum_scaler,
    quantum_data_facts,
)


def frame(rows: int = 600, fraud_every: int = 10) -> pd.DataFrame:
    result = pd.DataFrame(
        {name: np.arange(rows, dtype=float) for name in FEATURE_COLUMNS}
    )
    result["Class"] = [int(index % fraud_every == 0) for index in range(rows)]
    return result


def test_bounded_feasibility_sample_is_deterministic_and_exact_size() -> None:
    config = QSVCDataConfig(train_size=100, legitimate_per_fraud=4)
    first = bounded_feasibility_sample(frame(), config)
    second = bounded_feasibility_sample(frame(), config)
    assert len(first) == 100
    assert first.equals(second)
    assert int(first["Class"].sum()) == 20


def test_case_control_sample_rejects_insufficient_positive_cases() -> None:
    config = QSVCDataConfig(evaluation_size=100, evaluation_fraud_cases=61)
    with pytest.raises(ValueError, match="insufficient fraud"):
        bounded_temporal_case_control_sample(frame(), config)


def test_quantum_scaler_is_train_fitted_and_workload_is_recorded() -> None:
    config = QSVCDataConfig(train_size=100, evaluation_size=100, evaluation_fraud_cases=10)
    train = bounded_feasibility_sample(frame(), config)
    test = bounded_temporal_case_control_sample(frame(), config)
    features = FEATURE_COLUMNS[:8]
    scaler = fit_quantum_scaler(train, features)
    scaled_train = scaler.transform(train[features])
    assert scaled_train.min() == pytest.approx(0)
    assert scaled_train.max() == pytest.approx(1)
    facts = quantum_data_facts(train, test, features, config)
    assert facts["qubits"] == 8
    assert facts["max_train_kernel_entries"] == 10_000
    assert facts["max_test_train_kernel_entries"] == 10_000
