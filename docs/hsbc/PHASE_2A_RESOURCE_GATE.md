# Phase 2a resource gate

The current 8 GB RAM Mac has approximately 37 GiB free, with the HSBC virtual environment using about 479 MB and the local ULB CSV using about 144 MB. A no-install dependency resolution identifies Qiskit, Qiskit Aer, Qiskit Machine Learning, and their small Python dependencies, but does not reliably provide final installed sizes.

Do not install the simulator stack locally or create another environment until the required wheel/download size is measured or the user explicitly approves the added footprint. Phase 2a is intended to execute in the existing private Kaggle CPU Kernel where Linux wheels and simulator resources do not consume local development storage.

The first remote configuration is bounded to 256 QSVC training examples and at most 1,000 temporal test examples. The next 512-row experiment is gated on an artifact-backed successful 256-row run.
