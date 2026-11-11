"""HSBC research tests exercise the optional extras in pyproject.toml
([hsbc], [hsbc-quantum]). Core CI installs only requirements.txt, so
files whose deps aren't installed are skipped at collection — the
dependency-free report tests still run everywhere."""

import importlib.util

collect_ignore: list[str] = []

def _missing(*mods: str) -> bool:
    return any(importlib.util.find_spec(m) is None for m in mods)

if _missing("numpy", "pandas", "sklearn"):
    collect_ignore += ["test_phase1.py", "test_quantum_data.py"]
if _missing("qiskit"):
    collect_ignore.append("test_quantum_models.py")
