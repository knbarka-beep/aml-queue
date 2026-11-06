"""Build the DuckDB rule layer and export JSON for the dashboard.

Steps:
  1. Create data/aml.duckdb from scratch: raw CSVs, countries and parameters from config/rules.yaml.
  2. Run every sql/*.sql file in number order (one view per file). The rules, alerts, cases and risk score live there.
  3. Run the consistency checks (view v_checks). Stop if any fails.
  4. Export JSON to data/export/ and copy it into web/data/, so the site builds from web/ alone.

Optional inputs, used when they exist: data/ai/summaries.json (AI drafts), data/eval/scores.json (aggregate scores
from evaluate.py). This script never reads the answer key or the name-origin file.
Run:  python scripts/build_db.py
"""
import json
import shutil
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import duckdb
import yaml

sys.path.insert(0, str(Path(__file__).parent))
from fmt import date_dk, eur, month_label, num, pct  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CFG = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
DB = ROOT / "data" / "aml.duckdb"
EXPORT = ROOT / "data" / "export"
WEB_DATA = ROOT / "web" / "data"
SCORES = ROOT / "data" / "eval" / "scores.json"
SUMMARIES = ROOT / "data" / "ai" / "summaries.json"
RUN_LOG = ROOT / "data" / "ai" / "run_log.json"
R = CFG["rules"]

PURPOSE = {"salary": "salary", "family_support": "family support", "savings": "savings", "business_payments": "business payments"}


def connect():
    """Fresh database with all views. Returns the connection."""
    DB.unlink(missing_ok=True)
    con = duckdb.connect(str(DB))
    con.execute(f"CREATE TABLE customers AS SELECT * FROM read_csv('{(ROOT / 'data/raw/customers.csv').as_posix()}', header=true)")
    con.execute(f"""CREATE TABLE transactions AS SELECT * EXCLUDE (timestamp), CAST(timestamp AS TIMESTAMP) AS ts
                    FROM read_csv('{(ROOT / 'data/raw/transactions.csv').as_posix()}', header=true, types={{'amount_eur': 'DOUBLE'}})""")
    con.execute("CREATE TABLE countries (country VARCHAR, tier VARCHAR)")
    con.executemany("INSERT INTO countries VALUES (?, ?)", list(CFG["countries"].items()))
    con.execute("CREATE TABLE rule_info (rule_id VARCHAR, name VARCHAR, weight INTEGER)")
    con.executemany("INSERT INTO rule_info VALUES (?, ?, ?)", [(k, v["name"], v["weight"]) for k, v in R.items()])

    # One-row parameter table: every rule setting as rN_setting, plus period, alert and score settings.
    params = {"period_start": CFG["period"]["start"], "period_end": CFG["period"]["end"],
              "cooldown_days": CFG["alerts"]["cooldown_days"], "case_grouping_days": CFG["alerts"]["case_grouping_days"],
              "amount_points_max": CFG["risk_score"]["amount_points_max"],
              "amount_ratio_full": CFG["risk_score"]["amount_ratio_full"]}
    params |= {f"kyc_points_{k}": v for k, v in CFG["risk_score"]["kyc_points"].items()}
    for rid, rule in R.items():
        for k, v in rule.items():
            if k not in ("name", "reason", "weight"):
                params[f"{rid.lower()}_{k}"] = ",".join(v) if isinstance(v, list) else v
    cols = ", ".join(f"? AS {k}" for k in params)
    con.execute(f"CREATE TABLE params AS SELECT {cols}", list(params.values()))
    con.execute("ALTER TABLE params ALTER period_start TYPE DATE; ALTER TABLE params ALTER period_end TYPE DATE")

    # Aggregate rule scores from evaluate.py (no case-level truth). Empty before the first evaluation.
    con.execute("""CREATE TABLE eval_rule_scores (rule_id VARCHAR, true_positive_cases INTEGER, precision_pct DOUBLE,
                   planted_customers_with_pattern INTEGER, caught_customers_with_pattern INTEGER, recall_pct DOUBLE)""")
    if SCORES.exists():
        for r in json.loads(SCORES.read_text(encoding="utf-8"))["rules"]:
            con.execute("INSERT INTO eval_rule_scores VALUES (?, ?, ?, ?, ?, ?)",
                        [r["rule_id"], r["true_positive_cases"], r["precision_pct"], r["planted_customers_with_pattern"],
                         r["caught_customers_with_pattern"], r["recall_pct"]])

    for f in sorted((ROOT / "sql").glob("*.sql")):
        con.execute(f.read_text(encoding="utf-8"))
    # Materialise the expensive chain once, so later queries do not recompute the rules.
    con.execute("CREATE TABLE alert_case AS SELECT * FROM v_alert_case")
    return con


def rows(con, sql, params=()):
    cur = con.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def plain(v):
    if isinstance(v, (Decimal, float)):
        return round(float(v), 2)
    if isinstance(v, datetime):
        return v.isoformat(sep=" ", timespec="minutes")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, list):
        return [plain(x) for x in v]
    return v


def alert_reason(a, purpose):
    """Plain-language reason for one alert, with the measured numbers in display form."""
    rid, n, amt, m, m2 = a["rule_id"], a["n_tx"], a["amount_eur"], a["metric"], a["metric2"]
    if rid == "R1":
        lo = R["R1"]["threshold_eur"] * R["R1"]["band_low_pct"] / 100
        return (f"{n} transfers between {eur(lo)} and {eur(R['R1']['threshold_eur'])} within "
                f"{R['R1']['window_days']} days ({eur(amt)} in total)")
    if rid == "R2":
        return (f"{int(m2)} different senders paid in, and {pct(m)} of the money went out again "
                f"within {R['R2']['window_hours']} hours")
    if rid == "R3":
        return f"{int(m)} different senders paid in within {R['R3']['window_days']} days ({eur(amt)} in total)"
    if rid == "R4":
        return (f"Volume of {eur(amt)} in {R['R4']['window_days']} days, {num(m, 1)} times the baseline of "
                f"{eur(m2)} a month")
    if rid == "R5":
        return (f"{n} transfers to high-risk-tier countries within {R['R5']['window_days']} days "
                f"({eur(amt)} in total)")
    return (f"{int(m)} different counterparties within {R['R6']['window_days']} days, "
            f"while the declared purpose is {PURPOSE[purpose]}")


def rule_texts():
    """How each rule works, with its settings, for the dashboard and the AI input."""
    r = R
    lo = r["R1"]["threshold_eur"] * r["R1"]["band_low_pct"] / 100
    return {
        "R1": f"At least {r['R1']['min_count']} transfers between {eur(lo)} and {eur(r['R1']['threshold_eur'])} within {r['R1']['window_days']} days.",
        "R2": f"Money in from at least {r['R2']['min_senders']} senders (at least {eur(r['R2']['min_inflow_eur'])}) and at least {r['R2']['min_out_share_pct']} % of it out again within {r['R2']['window_hours']} hours.",
        "R3": f"At least {r['R3']['min_senders_private']} different senders (small business: {r['R3']['min_senders_business']}) within {r['R3']['window_days']} days.",
        "R4": f"Volume in {r['R4']['window_days']} days at least {r['R4']['multiple']} times the larger of the declared monthly volume and the customer's own average month in the {r['R4']['baseline_days']} days before, and at least {eur(r['R4']['min_volume_eur'])}.",
        "R5": f"Transfers to high-risk-tier countries within {r['R5']['window_days']} days: at least {eur(r['R5']['min_total_eur'])} in total or at least {r['R5']['min_count']} transfers.",
        "R6": f"Declared purpose savings or family support, but at least {r['R6']['min_counterparties']} different counterparties within {r['R6']['window_days']} days.",
    }


def case_rows(con):
    """Cases with alerts, reasons and the 90-day baseline: the input for both the AI and the dashboard."""
    cases = rows(con, """SELECT c.*, b.* EXCLUDE (case_id) FROM v_cases c JOIN v_case_baseline b USING (case_id)
                         ORDER BY case_id""")
    alerts = rows(con, "SELECT * FROM alert_case ORDER BY case_id, alert_date, rule_id")
    by_case = {}
    for a in alerts:
        by_case.setdefault(a["case_id"], []).append(a)
    for c in cases:
        c["alerts"] = [{"alert_id": a["alert_id"], "rule_id": a["rule_id"], "rule_name": R[a["rule_id"]]["name"],
                        "alert_date": a["alert_date"], "reason": alert_reason(a, c["declared_purpose"])}
                       for a in by_case[c["case_id"]]]
    return cases


def write_json(name, data):
    path = EXPORT / f"{name}.json"
    if isinstance(data, list):
        body = "[\n" + ",\n".join(json.dumps({k: plain(v) for k, v in r.items()}, ensure_ascii=False, default=plain) for r in data) + "\n]\n"
    else:
        body = json.dumps(data, indent=2, ensure_ascii=False, default=plain) + "\n"
    path.write_text(body, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({len(data) if isinstance(data, list) else 1} records)")


def main():
    con = connect()
    checks = rows(con, "SELECT * FROM v_checks ORDER BY check_no")
    print(f"{'#':<3}{'Check':<66}{'Checked':>8}{'Failed':>8}  Result")
    for c in checks:
        print(f"{c['check_no']:<3}{c['check_name']:<66}{c['checked']:>8}{c['failures']:>8}  {'PASS' if c['failures'] == 0 else 'FAIL'}")
    if any(c["failures"] for c in checks):
        sys.exit("Checks FAILED - nothing exported.")

    EXPORT.mkdir(parents=True, exist_ok=True)
    cases = case_rows(con)
    ai = {s["case_id"]: s for s in json.loads(SUMMARIES.read_text(encoding="utf-8"))} if SUMMARIES.exists() else {}
    for c in cases:
        s = ai.get(c["case_id"])
        c["ai"] = None if not s else {"summary": s["output"]["summary"], "suggestion": s["output"]["suggestion"],
                                      "reasons": s["output"]["reasons"], "missing": s["output"]["missing"],
                                      "check_passed": s["check"]["passed"], "failed_checks": s["check"]["failed"],
                                      "attempts": s["attempts"], "model": s["model"], "prompt_version": s["prompt_version"]}
    write_json("cases", cases)
    write_json("case_transactions", rows(con, "SELECT case_id, transaction_id, rules FROM v_case_transactions ORDER BY case_id, ts"))
    # Transactions for the drill-down timeline: customers with a case, from 90 days before their first case to their last case date.
    write_json("transactions", rows(con, """
        WITH span AS (SELECT customer_id, min(first_alert_date) - 90 AS d0, max(case_date) AS d1 FROM v_cases GROUP BY 1)
        SELECT t.transaction_id, t.ts, t.customer_id, t.direction, t.amount_eur, t.counterparty_id,
               t.counterparty_country, t.country_tier, t.channel
        FROM v_tx t JOIN span s USING (customer_id) WHERE t.tx_date BETWEEN s.d0 AND s.d1
        ORDER BY t.customer_id, t.ts"""))
    # Counterparty network for the drill-down (sql/17_v_case_network.sql): 90 days up to the case date, capped at 25 nodes.
    write_json("case_network", rows(con, """
        SELECT case_id, customer_id, is_case_customer, node_id, counterparty_country, country_tier, counterparties,
               direction, n_transfers, amount_eur
        FROM v_case_network ORDER BY case_id, amount_eur DESC, node_id, direction"""))
    write_json("customers", rows(con, "SELECT * FROM v_customer_profile ORDER BY customer_id"))
    write_json("monthly_kpis", rows(con, "SELECT * FROM v_monthly_kpis"))
    write_json("rule_performance", rows(con, "SELECT * FROM v_rule_performance"))

    scores = json.loads(SCORES.read_text(encoding="utf-8")) if SCORES.exists() else None
    fairness = json.loads((ROOT / "data/checks/fairness.json").read_text(encoding="utf-8"))
    run_log = json.loads(RUN_LOG.read_text(encoding="utf-8")) if RUN_LOG.exists() else None
    months = [r["month"] for r in rows(con, "SELECT month FROM v_monthly_kpis")]
    write_json("meta", {
        "company": CFG["company"],
        "notice": "All data is fictional. Lysbro Pay ApS, its customers and every transaction are invented.",
        "months": months, "month_labels": {m: month_label(m) for m in months}, "default_month": months[-1],
        "rules": {rid: {"name": r["name"], "weight": r["weight"], "how": rule_texts()[rid]} for rid, r in R.items()},
        "risk_score": CFG["risk_score"], "countries": CFG["countries"],
        "case_count": len(cases), "alert_count": rows(con, "SELECT count(*) AS n FROM alert_case")[0]["n"],
        "scores": scores,  # aggregate only: no case is marked as planted
        "fairness": {"planted_mix_within_pp": fairness["tolerance_pp"], "passed": fairness["passed"],
                     "max_difference_pp": max(abs(v) for v in fairness["difference_pp"].values())},
        "ai_run": run_log,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    con.close()

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for f in EXPORT.glob("*.json"):
        shutil.copy2(f, WEB_DATA / f.name)
    print(f"copied {len(list(EXPORT.glob('*.json')))} files to web/data/")
    print(f"\n{len(cases)} cases from {rows_count(cases)}")


def rows_count(cases):
    return f"{sum(len(c['alerts']) for c in cases)} alerts"


if __name__ == "__main__":
    main()
