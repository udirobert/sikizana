# Results index

## Phase 1 — remote classical baseline

- **Run ID:** `phase1-kaggle-20260915T040550Z`
- **Execution:** private Kaggle CPU Kernel, self-contained runner; Python 3.12.13, pandas 2.3.3, scikit-learn 1.6.1, XGBoost 3.2.0; source revision `6704ad083ace13ea4758417732cae9f1b156bd61`.
- **Dataset:** ULB European Cardholder dataset, 284,807 transactions / 492 frauds; SHA-256 `76274b691b16a6c49d3f159c883398e03ccd6d1ee12d9d8ee38f4b4b98551a89`; DbCL-1.0 as reported by Kaggle.
- **Temporal held-out test:** 56,962 transactions / 75 frauds.
- **Full-feature XGBoost:** AUC-ROC 0.9874, AUPRC 0.7941, F1 0.7541, precision 0.9787, recall 0.6133.
- **Scaled weighted logistic regression:** AUC-ROC 0.9864, AUPRC 0.7798, F1 0.7840, precision 0.9800, recall 0.6533.
- **Selected encoding features:** `V14`, `V10`, `V4`, `V8`, `V12`, `V20`, `V19`, `V13`, `Amount`, `V7`.
- **Reduced-feature feasibility XGBoost:** AUC-ROC 0.9890, AUPRC 0.7736, F1 0.7606, precision 0.8060, recall 0.7200.
- **Validation gate:** **passed**. Reduced-feature AUPRC was 2.58% below the full-feature reference, within the maximum 15% relative degradation; the held-out test contained more than the required 25 fraud cases.

The corresponding `meta.json`, `facts.json`, and `provenance.json` were produced by Kaggle Kernel version 6. This final run is stamped to the exact standardized-baseline implementation revision above.

Do not compare future quantum results to the full-data XGBoost reference unless the feature set, training sample, and test set are equivalent.
