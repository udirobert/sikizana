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
2. Draw a separate fixed-seed, native-prevalence temporal-test subset of at most 1,000 rows. Because native prevalence can yield too few fraud cases at 1,000 rows, the runner must fail rather than report unstable AUPRC/F1 when its predefined minimum positive count is not met. The initial minimum is 10 fraud cases.
3. Fit `MinMaxScaler(feature_range=(0, 1))` on QSVC training features only. Apply it unchanged to validation/test data. This bounds feature-map rotations and prevents information leakage.
4. Train QSVC with a linear-entanglement, two-repetition ZZ feature map. Report the feature map, qubit count, repetitions, entanglement, simulator backend, and kernel matrix dimensions.

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
- Keep the first test subset at 1,000 or fewer rows, yielding at most 256,000 train-test kernel entries at 256 training rows.
- A Phase 2a run is valid only if artifacts include all required provenance/facts metadata, the predefined positive-count gate passes, and all same-sample controls finish.

## Interpretation gate

The first success criterion is reproducibility and a meaningful comparison against same-sample classical SVC controls. A quantum result is not compared directly to the full-data Phase 1 XGBoost reference. Any hardware run is deferred until the simulator result is reviewed.

## Out of scope

QAE, IBM/IQM/Moth hardware execution, AWS Braket jobs, SHAP analysis, feature attribution claims for quantum kernels, and IEEE-CIS remain out of scope.
