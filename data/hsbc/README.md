# HSBC local data

- `raw/` contains the downloaded ULB `creditcard.csv` and is never committed.
- `processed/` contains derived local datasets and is never committed.
- `runs/<run-id>/` contains compact reproducibility artifacts. `meta.json`, `facts.json`, and `provenance.json` are retained; large matrices, models, and plots remain ignored.

Download instructions and the required source/license record are in [`docs/hsbc/DATASET.md`](../../docs/hsbc/DATASET.md).
