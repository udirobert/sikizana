import pytest

from src.hsbc.quantum_models import qsvc_simulator, quantum_model_facts


def test_qsvc_factory_exposes_expected_feature_dimension() -> None:
    model = qsvc_simulator(4, reps=2, entanglement="linear")
    assert model.quantum_kernel.feature_map.num_qubits == 4


def test_qsvc_rejects_one_feature_encoding() -> None:
    with pytest.raises(ValueError, match="at least two"):
        qsvc_simulator(1)


def test_quantum_model_facts_records_circuit_shape() -> None:
    facts = quantum_model_facts(4, reps=2, entanglement="linear")
    assert facts["qubits"] == 4
    assert facts["circuit_depth"] > 0
    assert facts["backend"] == "StatevectorSampler"
    assert facts["shots"] == 1024
