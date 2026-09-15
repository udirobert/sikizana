# Phase 2a — QSVC simulator plan

## Objective

Evaluate a quantum-kernel support-vector classifier (QSVC) against classical controls on an identical, bounded data regime. This is a simulator proof-of-method, not a claim that quantum outperforms the full-data Phase 1 XGBoost reference.

## Frozen inputs

- Dataset and temporal split: the validated Phase 1 ULB protocol and checksum.
- Encoding candidates: top eight and top ten Phase 1 importance-ranked features.
- Feature order for ten qubits: `V14`, `V10`, `V4`, `V8`, `V12`, `V20`, `V19`, `V13`, `Amount`, `V7`.
- Validation and test examples must remain outside QSVC training.

## Data design

1. Draw a fixed-seed, fraud-enriched training subset from the Phase 1 training partition. Start with 256 rows and record both class counts and prevalence.
2. Draw separate fixed-seed **case-control** validation and test cohorts of 1,000 rows from their respective held-out partitions, each with 10 sampled frauds and 990 sampled legitimate transactions. The validation cohort remains in the pre-test validation partition; the test cohort remains in the untouched latest-time temporal test partition. Their 1% fraud prevalence is intentionally enriched from production prevalence and is recorded in artifacts; therefore their AUPRC/F1 values are same-cohort model comparisons, not production-prevalence estimates.
3. Fit `MinMaxScaler(feature_range=(0, 1))` on QSVC training features only. Apply it unchanged to validation/test data. This bounds feature-map rotations and prevents information leakage.
4. Train QSVC with a linear-entanglement, two-repetition ZZ feature map and a seeded, fixed 1,024-shot `StatevectorSampler` fidelity estimate. Report the feature map, qubit count, repetitions, entanglement, shots, seed, simulator backend, and kernel matrix dimensions.

## Fair controls

For each feature-count and sample configuration, train and evaluate all models on the identical training/test subsets and feature order:

- QSVC with the quantum kernel;
- RBF `SVC` with a train-fitted standard scaler;
- linear SVC or scaled logistic regression;
- reduced-feature XGBoost.

Thresholds for probabilistic controls are selected only on their corresponding validation data. QSVC/SVC decision-function thresholds follow the same validation-only selection rule.

## Resource bounds and gates

- Start at 256 training rows: at most 65,536 training-kernel entries before symmetry reuse.
- Do not move to 512 training rows (262,144 entries) unless the 256-row simulator run completes, produces artifacts, and fits the remote execution budget.
- Keep each first validation/test cohort at 1,000 rows, yielding at most 256,000 kernel entries per 256-row train-to-cohort evaluation.
- A Phase 2a run is valid only if artifacts include all required provenance/facts metadata, the predefined positive-count gate passes, and all same-sample controls finish.

## Interpretation gate

The first success criterion is reproducibility and a meaningful comparison against same-sample classical SVC controls. A quantum result is not compared directly to the full-data Phase 1 XGBoost reference. Any hardware run is deferred until the simulator result is reviewed.

## Out of scope

QAE, IBM/IQM/Moth hardware execution, AWS Braket jobs, SHAP analysis, feature attribution claims for quantum kernels, and IEEE-CIS remain out of scope.
