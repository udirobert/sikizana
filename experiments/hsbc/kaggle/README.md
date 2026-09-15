# Kaggle Kernel submission bundle

This private Kaggle script runs a pinned offline snapshot of the canonical `src.hsbc.run_phase1` entry point on Kaggle Linux CPU infrastructure. Kaggle mounts `mlg-ulb/creditcardfraud` beneath `/kaggle/input/`; the wrapper resolves the one expected `creditcard.csv` instead of relying on a provider-specific mount-folder alias. The CSV is never uploaded from this repository. The snapshot exists because Kaggle may disable outbound DNS despite `enable_internet`; its source revision is recorded in `meta.json`.

## Preflight

1. Commit and push the HSBC workstream to `https://github.com/udirobert/sikizana`.
2. Confirm the pinned runner snapshot matches the canonical `src/hsbc/` implementation and its `SOURCE_REVISION` names the source commit.
3. Confirm the Kernel remains private, GPU remains disabled, and the ULB dataset input is listed.

## Submit and retrieve

From the repository root, with `KAGGLE_API_TOKEN` loaded only from ignored `.env.hsbc`:

```bash
set -a; source .env.hsbc; set +a
.venv-hsbc/bin/kaggle kernels push -p experiments/hsbc/kaggle
.venv-hsbc/bin/kaggle kernels status <your-kaggle-username>/hsbc-phase1-baseline
.venv-hsbc/bin/kaggle kernels output <your-kaggle-username>/hsbc-phase1-baseline -p data/hsbc/runs
```

The intended output is exactly one `data/hsbc/runs/<run-id>/` directory containing `meta.json`, `provenance.json`, and `facts.json`. `facts.json` contains the AUPRC gate outcome. Do not claim a Phase 1 result until these artifacts are retrieved and reviewed.

## Security and reproducibility

The script needs no Kaggle or Moth credential because Kaggle mounts the dataset. It clones the exact pushed source SHA rather than an unpinned branch; its output metadata records environment versions and the source revision. Do not make the kernel public until the submission and dataset licensing terms permit it.
