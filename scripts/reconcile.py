"""Reconciliation checks on the generated data. Prints PASS/FAIL per check and exits 1 on any FAIL.

Never reads data/truth/. The fairness check result is read from data/checks/fairness.json,
which generate.py writes (the generator is the only script that knows the planted customers).
Run:  python scripts/reconcile.py
"""
import json
import sys
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
cfg = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
cust = pd.read_csv(ROOT / "data/raw/customers.csv")
tx = pd.read_csv(ROOT / "data/raw/transactions.csv", parse_dates=["timestamp"])
report = json.loads((ROOT / "data/checks/generate_report.json").read_text(encoding="utf-8"))
fair = json.loads((ROOT / "data/checks/fairness.json").read_text(encoding="utf-8"))

# Running balance per customer, in time order (ins before outs at the same minute, as in the generator).
tx = tx.sort_values(["customer_id", "timestamp", "direction"])  # "in" sorts before "out"
signed = tx["amount_eur"].where(tx["direction"] == "in", -tx["amount_eur"])
opening = tx["customer_id"].map(cust.set_index("customer_id")["opening_balance_eur"])
running = opening + signed.groupby(tx["customer_id"]).cumsum()

checks = [
    ("Balances never negative", (running < -0.005).sum()),
    ("Every transaction belongs to a customer", (~tx["customer_id"].isin(cust["customer_id"])).sum()),
    ("Transaction ids unique", tx["transaction_id"].duplicated().sum()),
    ("Row count: customers match the generator", abs(len(cust) - report["customers"])),
    ("Row count: transactions match the generator", abs(len(tx) - report["transactions"])),
    ("All amounts positive", (tx["amount_eur"] <= 0).sum()),
    ("All dates inside Jan-Sep 2026", ((tx["timestamp"] < cfg["period"]["history_start"])
                                       | (tx["timestamp"] >= "2026-10-01")).sum()),
    ("Directions are in/out only", (~tx["direction"].isin(["in", "out"])).sum()),
    ("Countries are in config/rules.yaml", (~tx["counterparty_country"].isin(cfg["countries"])).sum()
                                           + (~cust["home_country"].isin(cfg["countries"])).sum()),
    ("Fairness: planted name-origin mix within 5 points of everyone", 0 if fair["passed"] else 1),
]
print(f"{'Check':<64}{'Failures':>9}  Result")
for name, failures in checks:
    print(f"{name:<64}{int(failures):>9}  {'PASS' if failures == 0 else 'FAIL'}")
if any(f for _, f in checks):
    sys.exit("Reconciliation FAILED")
print("All reconciliation checks passed.")
