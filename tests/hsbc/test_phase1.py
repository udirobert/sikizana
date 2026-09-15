from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.hsbc.artifacts import write_run_artifacts
from src.hsbc.config import Phase1Config
from src.hsbc.data import FEATURE_COLUMNS, DatasetValidationError, dataset_facts, load_ulb_dataset
from src.hsbc.evaluate import classification_facts, relative_degradation, select_f1_threshold
from src.hsbc.splits import feasibility_sample, native_ratio_sample, temporal_train_validation_test


def sample_frame(rows: int = 100) -> pd.DataFrame:
    frame = pd.DataFrame({column: np.arange(rows, dtype=float) for column in FEATURE_COLUMNS})
    frame["Class"] = [1 if index % 10 == 0 else 0 for index in range(rows)]
    return frame


def test_dataset_loader_validates_and_returns_expected_columns(tmp_path: Path) -> None:
    source = tmp_path / "creditcard.csv"
    sample_frame().to_csv(source, index=False)
    loaded = load_ulb_dataset(source)
    assert list(loaded.columns) == [*FEATURE_COLUMNS, "Class"]
    assert dataset_facts(loaded)["fraud_count"] == 10


def test_dataset_loader_rejects_non_binary_classes(tmp_path: Path) -> None:
    source = tmp_path / "creditcard.csv"
    frame = sample_frame()
    frame.loc[0, "Class"] = 2
    frame.to_csv(source, index=False)
    with pytest.raises(DatasetValidationError, match="binary"):
        load_ulb_dataset(source)


def test_temporal_split_and_sampling_are_deterministic() -> None:
    config = Phase1Config(native_sample_size=30, feasibility_max_fraud=8)
    train, validation, test = temporal_train_validation_test(sample_frame(), config)
    assert train["Time"].max() < test["Time"].min()
    assert len(validation) > 0
    native_first = native_ratio_sample(train, config)
    native_second = native_ratio_sample(train, config)
    assert native_first.equals(native_second)
    assert len(native_first) == 30
    assert native_first["Class"].mean() == pytest.approx(train["Class"].mean(), abs=0.04)
    feasibility = feasibility_sample(train, config)
    assert feasibility["Class"].sum() == min(8, int(train["Class"].sum()))
    assert feasibility["Class"].mean() > train["Class"].mean()


def test_metrics_and_gate_math() -> None:
    labels = np.array([0, 0, 1, 1])
    scores = np.array([0.1, 0.4, 0.6, 0.9])
    threshold = select_f1_threshold(labels, scores)
    facts = classification_facts(labels, scores, threshold)
    assert facts["auprc"] == pytest.approx(1.0)
    assert facts["confusion_matrix"] == [[2, 0], [0, 2]]
    assert relative_degradation(0.8, 0.68) == pytest.approx(0.15)


def test_artifacts_are_atomic_and_do_not_overwrite(tmp_path: Path) -> None:
    run_directory = tmp_path / "runs" / "example"
    write_run_artifacts(run_directory, {"facts.json": {"passed": True}})
    assert (run_directory / "facts.json").exists()
    with pytest.raises(FileExistsError):
        write_run_artifacts(run_directory, {"facts.json": {"passed": False}})
