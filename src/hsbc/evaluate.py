"""Threshold selection and held-out classification metrics."""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)


def select_f1_threshold(labels: Any, scores: Any) -> float:
    precision, recall, thresholds = precision_recall_curve(labels, scores)
    if not len(thresholds):
        return 0.5
    f1_values = 2 * precision[:-1] * recall[:-1] / np.clip(
        precision[:-1] + recall[:-1], 1e-12, None
    )
    return float(thresholds[int(np.nanargmax(f1_values))])


def classification_facts(labels: Any, scores: Any, threshold: float) -> dict[str, Any]:
    predicted = (np.asarray(scores) >= threshold).astype(int)
    matrix = confusion_matrix(labels, predicted, labels=[0, 1])
    return {
        "auc_roc": float(roc_auc_score(labels, scores)),
        "auprc": float(average_precision_score(labels, scores)),
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "precision": float(precision_score(labels, predicted, zero_division=0)),
        "recall": float(recall_score(labels, predicted, zero_division=0)),
        "threshold": threshold,
        "confusion_matrix": matrix.tolist(),
    }


def relative_degradation(reference: float, candidate: float) -> float:
    if reference <= 0:
        raise ValueError("Reference metric must be positive")
    return (reference - candidate) / reference
