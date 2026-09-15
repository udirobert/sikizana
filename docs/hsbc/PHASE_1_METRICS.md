# Phase 1 metrics summary

> Generated from validated artifacts for run `phase1-kaggle-20260915T040550Z`.

Dataset SHA-256: `76274b691b16a6c49d3f159c883398e03ccd6d1ee12d9d8ee38f4b4b98551a89`
Temporal test set: 56,962 transactions / 75 frauds.

| Model | AUC-ROC | AUPRC | F1 | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full-feature XGBoost | 0.9874 | 0.7941 | 0.7541 | 0.9787 | 0.6133 |
| Scaled weighted logistic regression | 0.9864 | 0.7798 | 0.7840 | 0.9800 | 0.6533 |
| Reduced-feature feasibility XGBoost | 0.9890 | 0.7736 | 0.7606 | 0.8060 | 0.7200 |

**AUPRC gate: PASSED** — 2.58% relative degradation (maximum 15%).

The exact input provenance, model configuration, selected features, confusion matrices, and gate calculation remain in the local-only artifacts at `data/hsbc/runs/phase1-kaggle-20260915T040550Z/`. See [RESULTS.md](RESULTS.md) for interpretation and [RUN_PROTOCOL.md](RUN_PROTOCOL.md) for the reproducibility contract.
