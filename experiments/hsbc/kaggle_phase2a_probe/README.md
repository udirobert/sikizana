# Phase 2a Kaggle environment probe

This private, CPU-only Kernel performs no training and makes no network calls. It verifies that Kaggle mounts the ULB CSV and reports whether the Qiskit, Qiskit Aer, Qiskit Machine Learning, and XGBoost packages are already available in the current image.

The output is a compact `qsvc-environment-probe.json` file. The full 256-row QSVC simulator benchmark is submitted only if this probe confirms the required packages are available.
