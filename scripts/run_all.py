"""Run the whole pipeline except the AI calls, in order, stopping at the first failure.

  generate -> reconcile -> rules + export (build_db) -> AI draft checks -> evaluate -> export again with the scores
  -> truth-access test -> network view test

The AI step (write_summaries.py) is run by hand, once; its stored drafts are reused here.
Run:  python scripts/run_all.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEPS = ["scripts/generate.py", "scripts/reconcile.py", "scripts/fmt.py", "scripts/build_db.py",
         "scripts/check_summaries.py", "scripts/evaluate.py", "scripts/build_db.py", "tests/test_truth_access.py",
         "tests/test_case_network.py"]

for step in STEPS:
    print(f"\n=== {step}", flush=True)
    if subprocess.run([sys.executable, step], cwd=ROOT).returncode:
        sys.exit(f"{step} failed")
print("\nPipeline done. Next: cd web && npm run build")
