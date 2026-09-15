"""Validate HSBC run artifacts and render reviewer-ready metric summaries."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REQUIRED_ARTIFACTS = frozenset({"meta.json", "facts.json", "provenance.json"})


class ArtifactValidationError(ValueError):
    """Raised when a run artifact set violates the reproducibility contract."""


def load_and_validate_run(run_directory: str | Path) -> dict[str, dict[str, Any]]:
    """Load a completed run only when its required facts and gate agree."""
    directory = Path(run_directory)
    files = {path.name for path in directory.glob("*.json")}
    missing = REQUIRED_ARTIFACTS.difference(files)
    if missing:
        raise ArtifactValidationError(f"Missing required artifacts: {sorted(missing)}")

    artifacts = {
        filename: json.loads((directory / filename).read_text(encoding="utf-8"))
        for filename in REQUIRED_ARTIFACTS
    }
    if not all(isinstance(content, dict) for content in artifacts.values()):
        raise ArtifactValidationError("Each required artifact must be a JSON object")

    meta, facts, provenance = (
        artifacts["meta.json"],
        artifacts["facts.json"],
        artifacts["provenance.json"],
    )
    if not isinstance(meta.get("run_id"), str) or not meta["run_id"]:
        raise ArtifactValidationError("meta.json requires a non-empty run_id")
    if not isinstance(provenance.get("sha256"), str) or len(provenance["sha256"]) != 64:
        raise ArtifactValidationError("provenance.json requires a SHA-256 checksum")

    gate = facts.get("gate")
    if not isinstance(gate, dict):
        raise ArtifactValidationError("facts.json requires a gate object")
    required_gate_fields = {
        "full_reference",
        "reduced_candidate",
        "relative_degradation",
        "maximum_relative_degradation",
        "minimum_test_fraud_cases",
        "passed",
    }
    if missing_gate_fields := required_gate_fields.difference(gate):
        raise ArtifactValidationError(
            f"gate is missing fields: {sorted(missing_gate_fields)}"
        )
    reference = float(gate["full_reference"])
    candidate = float(gate["reduced_candidate"])
    expected_degradation = (reference - candidate) / reference
    if reference <= 0 or abs(float(gate["relative_degradation"]) - expected_degradation) > 1e-12:
        raise ArtifactValidationError("gate relative degradation does not match its metrics")
    expected_passed = (
        expected_degradation <= float(gate["maximum_relative_degradation"])
        and int(facts.get("test_fraud_count", 0)) >= int(gate["minimum_test_fraud_cases"])
    )
    if gate["passed"] is not expected_passed:
        raise ArtifactValidationError("gate pass value does not match the declared criteria")
    return artifacts


def load_and_validate_phase2a_run(
    run_directory: str | Path,
) -> dict[str, dict[str, Any]]:
    """Load a Phase 2a QSVC run only when its declared controls and cohorts pass."""
    directory = Path(run_directory)
    files = {path.name for path in directory.glob("*.json")}
    missing = REQUIRED_ARTIFACTS.difference(files)
    if missing:
        raise ArtifactValidationError(f"Missing required artifacts: {sorted(missing)}")
    artifacts = {
        filename: json.loads((directory / filename).read_text(encoding="utf-8"))
        for filename in REQUIRED_ARTIFACTS
    }
    meta, facts, provenance = (
        artifacts["meta.json"],
        artifacts["facts.json"],
        artifacts["provenance.json"],
    )
    if not isinstance(meta.get("run_id"), str) or not meta["run_id"]:
        raise ArtifactValidationError("meta.json requires a non-empty run_id")
    if not isinstance(provenance.get("sha256"), str) or len(provenance["sha256"]) != 64:
        raise ArtifactValidationError("provenance.json requires a SHA-256 checksum")

    models = facts.get("models")
    required_models = {"qsvc", "rbf_svc", "logistic", "xgboost"}
    if not isinstance(models, dict) or required_models.difference(models):
        raise ArtifactValidationError("facts.json requires all Phase 2a controls")
    quantum = facts.get("quantum")
    if not isinstance(quantum, dict) or quantum.get("algorithm") != "QSVC":
        raise ArtifactValidationError("facts.json requires QSVC quantum metadata")
    if int(quantum.get("qubits", 0)) < 2:
        raise ArtifactValidationError("QSVC quantum metadata requires at least two qubits")
    gates = facts.get("gates")
    if not isinstance(gates, dict):
        raise ArtifactValidationError("facts.json requires Phase 2a gates")
    for gate in (
        "all_controls_completed",
        "validation_case_control_passed",
        "test_case_control_passed",
    ):
        if gates.get(gate) is not True:
            raise ArtifactValidationError(f"Phase 2a {gate} gate did not pass")
    return artifacts


def render_metrics_summary(artifacts: dict[str, dict[str, Any]]) -> str:
    """Render a compact Markdown table from validated run artifacts."""
    facts = artifacts["facts.json"]
    provenance = artifacts["provenance.json"]
    meta = artifacts["meta.json"]
    models = facts["models"]
    lines = [
        f"## Run `{meta['run_id']}`",
        "",
        f"Dataset SHA-256: `{provenance['sha256']}`  ",
        f"Temporal test set: {facts['split_counts']['test']:,} transactions / "
        f"{facts['test_fraud_count']} frauds.",
        "",
        "| Model | AUC-ROC | AUPRC | F1 | Precision | Recall |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    labels = {
        "xgboost_full": "Full-feature XGBoost",
        "logistic_full": "Scaled weighted logistic regression",
        "xgboost_reduced_feasibility": "Reduced-feature feasibility XGBoost",
    }
    for key, label in labels.items():
        metric = models[key]
        lines.append(
            f"| {label} | {metric['auc_roc']:.4f} | {metric['auprc']:.4f} | "
            f"{metric['f1']:.4f} | {metric['precision']:.4f} | {metric['recall']:.4f} |"
        )
    gate = facts["gate"]
    lines.extend(
        [
            "",
            f"**AUPRC gate: {'PASSED' if gate['passed'] else 'FAILED'}** — "
            f"{gate['relative_degradation']:.2%} relative degradation "
            f"(maximum {gate['maximum_relative_degradation']:.0%}).",
        ]
    )
    return "\n".join(lines) + "\n"
