# Phase 2a resource gate

The current 8 GB RAM Mac has approximately 37 GiB free, with the HSBC virtual environment using about 479 MB and the local ULB CSV using about 144 MB. A no-install dependency resolution identifies Qiskit, Qiskit Aer, Qiskit Machine Learning, and their small Python dependencies, but does not reliably provide final installed sizes.

The measured Qiskit simulator wheel set is approximately 47 MB; it is installed only in `.venv-hsbc`, which now occupies about 537 MB. This is within the local resource policy. The full Phase 2a benchmark remains intended for remote execution because local XGBoost cannot load against the available mismatched-architecture OpenMP runtime.

The first remote configuration is bounded to 256 QSVC training examples and at most 1,000 temporal test examples. The next 512-row experiment is gated on an artifact-backed successful 256-row run.
