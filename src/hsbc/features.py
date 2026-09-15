"""Training-only feature reduction for near-term quantum encoding."""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd


def select_top_features(model: object, feature_names: Sequence[str], count: int) -> list[str]:
    importances = getattr(model, "feature_importances_", None)
    if importances is None or len(importances) != len(feature_names):
        raise ValueError("Model must expose one feature importance per feature")
    ranked = sorted(zip(feature_names, importances, strict=True), key=lambda pair: (-pair[1], pair[0]))
    return [name for name, _ in ranked[:count]]


def feature_importance_facts(model: object, feature_names: Sequence[str]) -> list[dict[str, float | str]]:
    importances = getattr(model, "feature_importances_", None)
    return [
        {"feature": name, "importance": float(importance)}
        for name, importance in sorted(
            zip(feature_names, importances, strict=True), key=lambda pair: (-pair[1], pair[0])
        )
    ]
