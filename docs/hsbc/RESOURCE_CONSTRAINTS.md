# Local resource constraints

The development machine has 8 GB RAM and constrained local disk capacity. Phase 1 is designed to stay small:

- The ULB `creditcard.csv` is typically about 150 MB unpacked.
- The isolated `.venv-hsbc` currently occupies about 465 MB.
- The canonical runner loads the CSV and model matrices in memory; close memory-intensive applications before a full run.
- Raw data, derived data, models, plots, and run payloads remain local-only and ignored by Git.

Before downloading or retaining a materially larger dataset (including IEEE-CIS), model checkpoint, simulator artifact, or expanded environment, estimate disk and RAM requirements and ask the user to choose an option. Prefer sampling, streaming, deletion after provenance capture, and external/remote execution where appropriate.
