# HSBC Enterprise Challenge — Quantum-Enhanced Fraud Detection

## Scope

This namespace holds a standalone submission for the HSBC Enterprise Challenge (Global Quantum + AI Challenge 2026): **Quantum-Enhanced Credit Card Fraud Detection for Digital Payment Ecosystems**. It is intentionally separate from Sikizana's Xero product and runtime.

Phase 1 establishes reproducible classical controls, feature reduction, and a quantum-execution sampling design. No quantum circuit, QPU, simulator, autoencoder, or SHAP analysis is implemented in this phase.

## Dataset

Phase 1 uses the European Cardholder (ULB) dataset: 284,807 transactions, 28 PCA-transformed features plus `Time` and `Amount`, with a fraud prevalence of approximately 0.172%. Acquisition and licensing requirements are documented in [DATASET.md](DATASET.md).

## Acceptance criterion

The canonical runner trains full-feature XGBoost and a weighted linear comparator, selects 8–10 features from training-only XGBoost importances, then validates the reduced-feature quantum-feasibility sample. The reduced-data XGBoost AUPRC must be within 15% relative of the full-data baseline, measured on the same untouched temporal test set. All results are machine-readable run artifacts, not narrative claims.

See [PHASE_1_PLAN.md](PHASE_1_PLAN.md) and [RUN_PROTOCOL.md](RUN_PROTOCOL.md).

## Credentials

`MOTH_API_KEY` is reserved for Phase 2 portability validation only. Its real value belongs in the ignored `.env.hsbc` file; Phase 1 makes no Moth API calls.
