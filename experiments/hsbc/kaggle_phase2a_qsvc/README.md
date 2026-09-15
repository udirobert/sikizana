# HSBC Phase 2a QSVC Kaggle run

This is a separate private, CPU-only Kaggle Kernel. It does not modify the completed Phase 1 baseline Kernel.

It mounts the ULB dataset and the private `udingethe/hsbc-qsvc-offline-wheels` dependency dataset. The script installs the pinned Linux wheels with `--no-index`, so it needs no outbound network access, then runs the frozen Phase 2a configuration:

- 8 selected features / qubits;
- 64 fraud-enriched training rows;
- separate 200-row case-control validation and latest-time test cohorts, with 10 fraud examples each;
- two-repetition, linear-entanglement ZZ feature map;
- seeded 1,024-shot `StatevectorSampler` fidelity estimate;
- same-cohort RBF SVC, scaled logistic, and XGBoost controls.

The case-control cohorts intentionally have 1% fraud prevalence. Their AUPRC/F1 values are therefore only fair *same-cohort* QSVC-versus-classical comparisons, not production-prevalence estimates. The Kernel writes `meta.json`, `provenance.json`, and `facts.json` under `/kaggle/working/data/hsbc/runs/`.
