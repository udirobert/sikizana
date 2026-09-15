"""Qiskit QSVC simulator model construction for HSBC Phase 2a."""

from __future__ import annotations

from qiskit.circuit.library import zz_feature_map
from qiskit_machine_learning.algorithms import QSVC
from qiskit_machine_learning.kernels import FidelityQuantumKernel


def qsvc_simulator(
    qubits: int, *, reps: int = 2, entanglement: str = "linear"
) -> QSVC:
    """Create a deterministic-statevector QSVC feature-map classifier.

    Input scaling is deliberately performed outside this factory so the
    scaler can be fitted exclusively to the selected training partition.
    """
    if qubits < 2:
        raise ValueError("QSVC requires at least two encoded features")
    feature_map = zz_feature_map(
        feature_dimension=qubits, reps=reps, entanglement=entanglement
    )
    kernel = FidelityQuantumKernel(feature_map=feature_map)
    return QSVC(quantum_kernel=kernel)


def quantum_model_facts(
    qubits: int, *, reps: int, entanglement: str
) -> dict[str, int | str]:
    """Return the circuit configuration required in a Phase 2a artifact."""
    circuit = zz_feature_map(
        feature_dimension=qubits, reps=reps, entanglement=entanglement
    )
    return {
        "algorithm": "QSVC",
        "kernel": "FidelityQuantumKernel",
        "feature_map": "ZZFeatureMap",
        "backend": "local_statevector_fidelity_simulator",
        "qubits": qubits,
        "feature_map_reps": reps,
        "entanglement": entanglement,
        "circuit_depth": circuit.decompose().depth(),
    }
