import json
from pathlib import Path

import pytest

from src.hsbc.report import ArtifactValidationError, load_and_validate_run, render_metrics_summary


def write_artifacts(directory: Path, *, passed: bool = True) -> None:
    directory.mkdir()
    (directory / "meta.json").write_text(json.dumps({"run_id": "run-1"}))
    (directory / "provenance.json").write_text(json.dumps({"sha256": "a" * 64}))
    (directory / "facts.json").write_text(
        json.dumps(
            {
                "split_counts": {"test": 100},
                "test_fraud_count": 30,
                "models": {
                    name: {
                        "auc_roc": 0.9,
                        "auprc": 0.8,
                        "f1": 0.7,
                        "precision": 0.6,
                        "recall": 0.5,
                    }
                    for name in (
                        "xgboost_full",
                        "logistic_full",
                        "xgboost_reduced_feasibility",
                    )
                },
                "gate": {
                    "full_reference": 0.8,
                    "reduced_candidate": 0.72,
                    "relative_degradation": 0.1,
                    "maximum_relative_degradation": 0.15,
                    "minimum_test_fraud_cases": 25,
                    "passed": passed,
                },
            }
        )
    )


def test_validated_run_renders_reviewer_metrics(tmp_path: Path) -> None:
    run_directory = tmp_path / "run"
    write_artifacts(run_directory)
    summary = render_metrics_summary(load_and_validate_run(run_directory))
    assert "AUPRC gate: PASSED" in summary
    assert "| Full-feature XGBoost | 0.9000 | 0.8000 |" in summary


def test_rejects_gate_that_does_not_match_declared_metrics(tmp_path: Path) -> None:
    run_directory = tmp_path / "run"
    write_artifacts(run_directory, passed=False)
    with pytest.raises(ArtifactValidationError, match="pass value"):
        load_and_validate_run(run_directory)


def test_rejects_missing_required_artifact(tmp_path: Path) -> None:
    with pytest.raises(ArtifactValidationError, match="Missing required"):
        load_and_validate_run(tmp_path)
