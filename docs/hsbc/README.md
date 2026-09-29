# HSBC Enterprise Challenge — Quantum-Enhanced Fraud Detection

## Scope

This namespace holds a standalone submission for the HSBC Enterprise Challenge (Global Quantum + AI Challenge 2026): **Quantum-Enhanced Credit Card Fraud Detection for Digital Payment Ecosystems**. It is intentionally separate from Sikizana's Xero product and runtime.

Phase 1 establishes reproducible classical controls, feature reduction, and a quantum-execution sampling design. No quantum circuit, QPU, simulator, autoencoder, or SHAP analysis is implemented in this phase.

## Dataset

Phase 1 uses the European Cardholder (ULB) dataset: 284,807 transactions, 28 PCA-transformed features plus `Time` and `Amount`, with a fraud prevalence of approximately 0.172%. Acquisition and licensing requirements are documented in [DATASET.md](DATASET.md).

## Acceptance criterion

The canonical runner trains full-feature XGBoost and a weighted linear comparator, selects 8–10 features from training-only XGBoost importances, then validates the reduced-feature quantum-feasibility sample. The reduced-data XGBoost AUPRC must be within 15% relative of the full-data baseline, measured on the same untouched temporal test set. All results are machine-readable run artifacts, not narrative claims.

See [PHASE_1_PLAN.md](PHASE_1_PLAN.md) and [RUN_PROTOCOL.md](RUN_PROTOCOL.md).

## Program status & key dates

- **Phase I (Ideation): concept proposal submitted** to the challenge portal before the 15 Sep 2026 close. The Phase 1 baseline and Phase 2a QSVC simulator evidence in [RESULTS.md](RESULTS.md) back that submission.
- **Phase I review: 16 Sep – 14 Nov 2026.** Enterprise sponsors and independent assessors review; finalists selected. Next external milestone: finalist announcement (~14 Nov 2026).
- **Phase II (PoC): 17 Nov 2026 – 28 Feb 2027.** Selected teams build the PoC with AWS compute credits, Classiq tooling, and expert office hours.
- **Review + close: 1 Mar – 30 Apr 2027.** PoC results benchmarked; winners announced 30 Apr 2027.

Program facts that bind our Phase II design (from the official program page):

- Hardware access is **not** required — simulators are sufficient; hardware runs are scheduled as capacity allows.
- Required submission artifacts: **container image, environment file, deterministic seeds, structured logs, README with run commands**. Our run-artifact protocol already covers seeds/logs; the container image is new work.
- Evaluation rubric: correctness, impact, efficiency, portability, reproducibility, security.
- The HSBC problem statement benchmarks classical models on **IEEE-CIS** (AUC-ROC 0.9459) — currently out of scope in [PHASE_2A_QSVC_PLAN.md](PHASE_2A_QSVC_PLAN.md); revisit before committing a Phase II plan.

Timeline source: <https://quantumai.thequantuminsider.com/program/> and <https://quantumai.thequantuminsider.com/challenges/> (checked 2026-09-30).

## Credentials

`MOTH_API_KEY` is reserved for Phase 2 portability validation only. Its real value belongs in the ignored `.env.hsbc` file; Phase 1 makes no Moth API calls.
