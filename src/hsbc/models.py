"""Fair classical model factories for the HSBC Phase 1 controls."""

from __future__ import annotations

from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier


def training_scale_pos_weight(labels: object) -> float:
    positives = int(sum(labels))
    negatives = len(labels) - positives
    if positives == 0:
        raise ValueError("Training labels must include fraud examples")
    return negatives / positives


def xgboost_baseline(seed: int, scale_pos_weight: float) -> XGBClassifier:
    return XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="aucpr",
        random_state=seed,
        n_jobs=1,
        scale_pos_weight=scale_pos_weight,
    )


def logistic_baseline(seed: int) -> LogisticRegression:
    return LogisticRegression(
        class_weight="balanced", max_iter=2000, random_state=seed, n_jobs=1
    )
