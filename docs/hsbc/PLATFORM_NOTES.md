# Platform notes

## Current benchmark blocker

The Phase 1 environment was created with ARM Python packages, including the ARM XGBoost wheel. On this Mac, Homebrew is installed under `/usr/local` and provides only an x86_64 `libomp.dylib`; XGBoost needs an ARM-compatible OpenMP runtime. The architectures cannot be linked.

Do not silently add a second translated environment or compile XGBoost from source. Either option materially increases disk use and build time on this 8 GB RAM development Mac and requires user approval under the repository resource policy.

## Options

1. Install an ARM-native Homebrew/OpenMP runtime, then reuse the existing ARM `.venv-hsbc` (lowest ongoing Python-environment overhead, but changes system tooling).
2. Create a separate x86_64 virtual environment and install matching x86_64 scientific packages (roughly another 500 MB or more, plus package caches).
3. Run Phase 1 remotely on an ARM/x86 Linux runner and retain only the compact run artifacts locally.

The ULB CSV is present locally at `data/hsbc/raw/creditcard.csv` (ignored by Git). No benchmark artifact has been produced yet.
