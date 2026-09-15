# Phase 1 plan

## Fixed scope

Phase 1 establishes the classical comparison point and quantum-encoding design only. QSVC/QAE circuits, Braket, Moth, Classiq, Qiskit, SHAP, and IEEE-CIS are explicitly out of scope.

## Leakage-safe protocol

1. Order ULB rows by `Time` and reserve the latest 20% as the untouched temporal test set.
2. Split the earlier 80% into stratified train and validation sets. Class weights are computed from the train partition only.
3. Fit full-feature XGBoost and a weighted logistic-regression baseline. The linear baseline is standardized with a scaler fitted only on training data. Choose each operating threshold from validation F1 only, then report the untouched-test AUC-ROC, AUPRC, F1, precision, recall, and confusion matrix.
4. Select the top 8–10 XGBoost importance-ranked features fitted on training data only.
5. Make two fixed-seed training-only quantum-design datasets:
   - **Native-ratio sample:** 1,500 rows sampled stratified at the source class prevalence. It preserves the real fraud rate for kernel workload planning.
   - **Feasibility sample:** fraud-enriched sample (default: up to 250 fraud examples and four legitimate examples per fraud). Its changed prevalence is declared in artifacts. It is used only to determine whether reduced features retain a learnable signal; evaluation always uses the untouched native-prevalence temporal test set.
6. Fit reduced-feature XGBoost on the feasibility sample and compare its held-out AUPRC with the full-feature XGBoost's held-out AUPRC. The gate passes only when the relative degradation is no more than 15% and the held-out test has at least 25 fraud cases.

## Why two samples

A 1,000–2,000 row native-rate sample has roughly two to four fraud events. Its F1 and AUPRC estimates are too unstable to support a credible circuit gate. Keeping a native-ratio workload sample alongside a separately labelled, training-only feasibility sample satisfies the scaling requirement without presenting an enriched training distribution as real-world performance.

## Fair Phase 2 comparison

Quantum and classical models must be compared on identical selected features, training-design sample, and untouched test set. Full-feature, full-data XGBoost is a ceiling/reference, not a direct quantum-versus-classical claim.
