"""Run the rules (R1-R6) and report alerts and cases per rule.

The rules themselves are SQL views in sql/02-07, with every setting from config/rules.yaml; alerts, case grouping
and the risk score are sql/08-11. This script builds the database (build_db.py) and prints the result.
Never reads the answer key.
Run:  python scripts/run_rules.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_db  # noqa: E402

build_db.main()
perf = json.loads((build_db.EXPORT / "rule_performance.json").read_text(encoding="utf-8"))
meta = json.loads((build_db.EXPORT / "meta.json").read_text(encoding="utf-8"))
print(f"\n{'Rule':<26}{'Alerts':>8}{'Cases':>8}")
for r in perf:
    print(f"{r['rule_id'] + ' ' + r['name']:<26}{r['alerts']:>8}{r['cases']:>8}")
print(f"{'All rules':<26}{meta['alert_count']:>8}{meta['case_count']:>8}   (a case can hit several rules)")
