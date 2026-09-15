# Phase 1 run protocol

Run the canonical entry point from the repository root:

```bash
source .venv-hsbc/bin/activate
pip install -e '.[hsbc-dev]'
python -m src.hsbc.run_phase1 --input data/hsbc/raw/creditcard.csv --run-id phase1-YYYYMMDDTHHMMSSZ
```

Each run writes `data/hsbc/runs/<run-id>/`:

- `meta.json`: run ID, UTC creation time, seed, immutable configuration, package versions, Python/platform information, and git revision.
- `provenance.json`: input path, SHA-256, source URL, license declaration, and input row/schema facts.
- `facts.json`: metrics for both full baselines and the reduced-feasibility model; selected features; class counts; native and feasibility sample design; exact gate calculation and boolean result.

A run ID must be unique. The runner creates artifacts atomically and refuses to overwrite a completed directory. JSON is deterministic (`sort_keys=True`) so differences are reviewable. No report may claim a result unless it links to a concrete run ID and its `facts.json`.
