"""Leakage-safe temporal split and fixed-seed sampling utilities."""

from __future__ import annotations

import pandas as pd
from sklearn.model_selection import train_test_split

from .config import Phase1Config


def temporal_train_validation_test(
    frame: pd.DataFrame, config: Phase1Config
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    ordered = frame.sort_values("Time", kind="stable").reset_index(drop=True)
    test_start = int(len(ordered) * (1 - config.temporal_test_fraction))
    training_pool, test = ordered.iloc[:test_start], ordered.iloc[test_start:]
    train, validation = train_test_split(
        training_pool,
        test_size=config.validation_fraction,
        random_state=config.seed,
        stratify=training_pool["Class"],
    )
    return train.copy(), validation.copy(), test.copy()


def native_ratio_sample(train: pd.DataFrame, config: Phase1Config) -> pd.DataFrame:
    """Return an exact-size sample with source-class proportions preserved."""
    size = min(config.native_sample_size, len(train))
    fraud_count = int(round(size * train["Class"].mean()))
    fraud_count = min(len(train.loc[train["Class"] == 1]), fraud_count)
    legitimate_count = size - fraud_count
    legitimate = train.loc[train["Class"] == 0]
    if legitimate_count > len(legitimate):
        legitimate_count = len(legitimate)
        fraud_count = size - legitimate_count
    sampled_fraud = train.loc[train["Class"] == 1].sample(
        n=fraud_count, random_state=config.seed
    )
    sampled_legitimate = legitimate.sample(
        n=legitimate_count, random_state=config.seed
    )
    return pd.concat([sampled_fraud, sampled_legitimate]).sample(
        frac=1, random_state=config.seed
    ).reset_index(drop=True)


def feasibility_sample(train: pd.DataFrame, config: Phase1Config) -> pd.DataFrame:
    fraud = train.loc[train["Class"] == 1]
    legitimate = train.loc[train["Class"] == 0]
    fraud_count = min(len(fraud), config.feasibility_max_fraud)
    if fraud_count == 0:
        raise ValueError("Feasibility sample requires at least one fraud example")
    sampled_fraud = fraud.sample(n=fraud_count, random_state=config.seed)
    legitimate_count = min(
        len(legitimate), fraud_count * config.feasibility_legitimate_per_fraud
    )
    sampled_legitimate = legitimate.sample(n=legitimate_count, random_state=config.seed)
    return pd.concat([sampled_fraud, sampled_legitimate]).sample(
        frac=1, random_state=config.seed
    ).reset_index(drop=True)
