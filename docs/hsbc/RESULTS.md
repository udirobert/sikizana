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

## Phase 2a — bounded QSVC simulator

- **Run ID:** `phase2a-qsvc-20260915T124203Z`
- **Execution:** private Kaggle CPU Kernel using an offline, pinned Qiskit dependency dataset; Python 3.12.13, Qiskit 2.3.1, Qiskit Aer 0.17.2, Qiskit Machine Learning 0.9.1, XGBoost 3.2.0.
- **Quantum configuration:** 8 qubits/features (`V14`, `V10`, `V4`, `V8`, `V12`, `V20`, `V19`, `V13`), two-repetition linear ZZ feature map, `ComputeUncompute` fidelity with seeded 1,024-shot `StatevectorSampler`; circuit depth 31.
- **Bounded cohort:** 64 fraud-enriched training rows (12 frauds); separate validation and latest-time test case-control cohorts of 200 rows / 10 frauds each. Their 5% prevalence is deliberately enriched, so these metrics are same-cohort comparisons only—not production-prevalence estimates.
- **QSVC:** AUC-ROC 0.8674, AUPRC 0.4741, F1 0.5217, precision 0.4615, recall 0.6000; QSVC wall-clock time 365.8 s.
- **Same-cohort classical controls:** RBF SVC AUPRC 0.6504 / F1 0.4615; scaled logistic regression AUPRC 0.8023 / F1 0.6667; XGBoost AUPRC 0.7815 / F1 0.5714.
- **Run gates:** passed—both case-control cohorts contained the declared 10 fraud cases and all controls completed.

This run establishes a reproducible QSVC simulator reference, but it does **not** demonstrate a quantum advantage: QSVC underperformed every same-cohort classical control on AUPRC. The initial 256-row/1,000-row QSVC configuration was deleted after becoming stalled without artifacts; the 64-row/200-row retry is the only reported Phase 2a result.

Do not compare future quantum results to the full-data XGBoost reference unless the feature set, training sample, and test set are equivalent.
