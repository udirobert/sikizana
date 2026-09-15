"""Immutable configuration for a reproducible HSBC Phase 1 run."""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Phase1Config:
    seed: int = 2026
    temporal_test_fraction: float = 0.20
    validation_fraction: float = 0.20
    top_feature_count: int = 10
    native_sample_size: int = 1500
    feasibility_max_fraud: int = 250
    feasibility_legitimate_per_fraud: int = 4
    max_auprc_relative_degradation: float = 0.15
    min_test_fraud_cases: int = 25

    def to_dict(self) -> dict[str, int | float]:
        return asdict(self)
