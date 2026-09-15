import json
from pathlib import Path

import pytest

from src.hsbc.report import ArtifactValidationError, load_and_validate_phase2a_run


def write_artifacts(directory: Path, *, controls_completed: bool = True) -> None:
    directory.mkdir()
    (directory / "meta.json").write_text(json.dumps({"run_id": "phase2a-test"}))
    (directory / "provenance.json").write_text(json.dumps({"sha256": "a" * 64}))
    (directory / "facts.json").write_text(
        json.dumps(
            {
                "models": {name: {} for name in ("qsvc", "rbf_svc", "logistic", "xgboost")},
                "quantum": {
                    "algorithm": "QSVC",
                    "qubits": 8,
                    "train_rows": 64,
                    "evaluation_rows": 200,
                },
                "gates": {
                    "all_controls_completed": controls_completed,
                    "validation_case_control_passed": True,
                    "test_case_control_passed": True,
                },
            }
        )
    )


def test_phase2a_validator_accepts_complete_artifacts(tmp_path: Path) -> None:
    run_directory = tmp_path / "run"
    write_artifacts(run_directory)
    assert load_and_validate_phase2a_run(run_directory)["meta.json"]["run_id"] == "phase2a-test"


def test_phase2a_validator_rejects_incomplete_controls(tmp_path: Path) -> None:
    run_directory = tmp_path / "run"
    write_artifacts(run_directory, controls_completed=False)
    with pytest.raises(ArtifactValidationError, match="controls"):
        load_and_validate_phase2a_run(run_directory)
