"""Score the rules and the AI suggestions against the answer key. The ONLY script that reads data/truth/.

Definitions are fixed in docs/metrics.md (committed before the AI run):
  true-positive case = a case on a planted customer with case date on or after the planted pattern's start date.
Writes aggregate numbers only to data/eval/scores.json (no case is marked as planted there), which build_db.py
shows on the dashboard. Prints a readable report.
Run:  python scripts/evaluate.py   (after build_db.py, and after write_summaries.py if AI drafts exist)
"""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULE_FOR = {"structuring": "R1", "pass_through": "R2", "fan_in": "R3", "dormant_spike": "R4",
            "high_risk_corridor": "R5", "purpose_mismatch": "R6"}


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def pct(a, b):
    return round(100 * a / b, 1) if b else None


def main():
    planted = {r["customer_id"]: r for r in read_csv(ROOT / "data/truth/planted.csv")}
    origin = {r["customer_id"]: r["name_origin_group"] for r in read_csv(ROOT / "data/fairness/name_origin.csv")}
    cases = json.loads((ROOT / "data/export/cases.json").read_text(encoding="utf-8"))
    meta = json.loads((ROOT / "data/export/meta.json").read_text(encoding="utf-8"))
    ai_file = ROOT / "data/ai/summaries.json"
    ai = {s["case_id"]: s for s in json.loads(ai_file.read_text(encoding="utf-8"))} if ai_file.exists() else {}

    def is_tp(c):
        p = planted.get(c["customer_id"])
        return bool(p) and c["case_date"] >= p["start_date"]

    tp = {c["case_id"]: is_tp(c) for c in cases}
    caught = {c["customer_id"] for c in cases if tp[c["case_id"]]}

    rules = []
    for rid in meta["rules"]:
        with_rule = [c for c in cases if rid in c["rules_hit"]]
        n_tp = sum(tp[c["case_id"]] for c in with_rule)
        pattern = [p for p, r in RULE_FOR.items() if r == rid][0]
        has_pattern = [cid for cid, p in planted.items() if pattern in p["patterns"].split("+")]
        caught_by_rule = {c["customer_id"] for c in with_rule if tp[c["case_id"]]}
        rules.append({"rule_id": rid, "cases": len(with_rule), "true_positive_cases": n_tp,
                      "precision_pct": pct(n_tp, len(with_rule)), "planted_customers_with_pattern": len(has_pattern),
                      "caught_customers_with_pattern": len(set(has_pattern) & caught_by_rule),
                      "recall_pct": pct(len(set(has_pattern) & caught_by_rule), len(has_pattern))})

    by_pattern = {}
    for p in RULE_FOR:
        ids = [cid for cid, r in planted.items() if r["primary_pattern"] == p]
        by_pattern[p] = {"planted": len(ids), "caught": len(set(ids) & caught)}
    by_strength = {s: {"planted": sum(r["strength"] == s for r in planted.values()),
                       "caught": sum(r["strength"] == s and cid in caught for cid, r in planted.items())}
                   for s in ("full", "weak")}

    n_tp = sum(tp.values())
    scores = {
        "definition": "True positive = case on a planted customer dated on or after the pattern started. See docs/metrics.md.",
        "overall": {"cases": len(cases), "true_positive_cases": n_tp, "false_positive_cases": len(cases) - n_tp,
                    "precision_pct": pct(n_tp, len(cases)), "planted_customers": len(planted),
                    "planted_customers_caught": len(caught), "recall_pct": pct(len(caught), len(planted)),
                    "cases_on_planted_customers_before_pattern_start": sum(
                        1 for c in cases if c["customer_id"] in planted and not tp[c["case_id"]])},
        "rules": rules, "recall_by_primary_pattern": by_pattern, "recall_by_strength": by_strength,
    }

    if ai:
        t2 = Counter((tp[cid], s["output"]["suggestion"]) for cid, s in ai.items())
        tp_n, fp_n = t2[(True, "escalate")] + t2[(True, "close as false positive")], \
            t2[(False, "escalate")] + t2[(False, "close as false positive")]
        attempts = read_csv(ROOT / "data/ai/summary_attempts.csv")
        scores["ai"] = {
            "drafts": len(ai), "cases_without_draft": len(cases) - len(ai),
            "table": {"suspicious_escalate": t2[(True, "escalate")], "suspicious_close": t2[(True, "close as false positive")],
                      "not_suspicious_escalate": t2[(False, "escalate")], "not_suspicious_close": t2[(False, "close as false positive")]},
            "escalation_rate_on_suspicious_pct": pct(t2[(True, "escalate")], tp_n),
            "close_rate_on_false_positives_pct": pct(t2[(False, "close as false positive")], fp_n),
            "number_check_first_attempt_passed": sum(1 for a in attempts if a["attempt"] == "1" and a["passed"] == "True"),
            "number_check_final_passed": sum(s["check"]["passed"] for s in ai.values()),
            "average_attempts": round(sum(s["attempts"] for s in ai.values()) / len(ai), 2),
        }

    # Fairness, aggregate: share of customers with a case and AI escalation rate per name-origin group.
    groups = sorted(set(origin.values()))
    case_customers = {c["customer_id"] for c in cases}
    fair = {}
    for g in groups:
        members = [cid for cid, x in origin.items() if x == g]
        g_cases = [c for c in cases if origin[c["customer_id"]] == g]
        esc = [c for c in g_cases if c["case_id"] in ai and ai[c["case_id"]]["output"]["suggestion"] == "escalate"]
        fair[g] = {"customers": len(members), "share_of_customers_pct": pct(len(members), len(origin)),
                   "customers_with_case_pct": pct(len(set(members) & case_customers), len(members)),
                   "share_of_cases_pct": pct(len(g_cases), len(cases)),
                   "ai_escalation_rate_pct": pct(len(esc), len([c for c in g_cases if c["case_id"] in ai]))}
    scores["fairness_by_name_origin_group"] = fair

    out = ROOT / "data/eval/scores.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(scores, indent=2) + "\n", encoding="utf-8")

    o = scores["overall"]
    print(f"Cases {o['cases']}: {o['true_positive_cases']} truly suspicious, precision {o['precision_pct']} %")
    print(f"Planted customers caught: {o['planted_customers_caught']} of {o['planted_customers']} (recall {o['recall_pct']} %)")
    print(f"\n{'Rule':<6}{'Cases':>7}{'TP':>5}{'Prec %':>8}{'Pattern':>9}{'Caught':>8}{'Recall %':>10}")
    for r in rules:
        print(f"{r['rule_id']:<6}{r['cases']:>7}{r['true_positive_cases']:>5}{str(r['precision_pct']):>8}"
              f"{r['planted_customers_with_pattern']:>9}{r['caught_customers_with_pattern']:>8}{str(r['recall_pct']):>10}")
    print("\nRecall by primary pattern:", json.dumps(by_pattern))
    print("Recall by strength:", json.dumps(by_strength))
    if "ai" in scores:
        a, t = scores["ai"], scores["ai"]["table"]
        print(f"\nAI drafts {a['drafts']}.            suggests escalate  suggests close")
        print(f"  truly suspicious     {t['suspicious_escalate']:>17}  {t['suspicious_close']:>14}")
        print(f"  not suspicious       {t['not_suspicious_escalate']:>17}  {t['not_suspicious_close']:>14}")
        print(f"  escalation rate on suspicious {a['escalation_rate_on_suspicious_pct']} %, "
              f"close rate on false positives {a['close_rate_on_false_positives_pct']} %")
        print(f"  number check: first attempt {a['number_check_first_attempt_passed']} of {a['drafts']}, "
              f"final {a['number_check_final_passed']} of {a['drafts']}")
    print("\nFairness by name-origin group:")
    for g, f in fair.items():
        print(f"  {g}: {f['share_of_customers_pct']} % of customers, {f['share_of_cases_pct']} % of cases, "
              f"{f['customers_with_case_pct']} % have a case, AI escalates {f['ai_escalation_rate_pct']} %")


if __name__ == "__main__":
    main()
