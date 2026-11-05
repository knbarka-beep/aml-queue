"""Draft an AI case summary for every case with Claude (claude-haiku-5-5). Text is generated once and stored.

Usage:
  python scripts/write_summaries.py --dry-run   # build the inputs, write data/ai/prompts/inputs.jsonl, estimate cost; no API
  python scripts/write_summaries.py             # the real run (once)

Input per case: only data up to the case date, from data/export/ (built by build_db.py): the customer profile
(no name, no name origin), the rules hit with their reasons, the triggering transactions and a 90-day summary of
normal activity before the first alert. Every amount is given exact and in display form.

Validate and retry: after each attempt, check_summaries.check_draft() runs. On failure, one follow-up message lists
the failed checks; at most 2 retries; the last attempt is kept. Every attempt goes to data/ai/summary_attempts.csv.

Cost: the worst case (3 attempts for every case, every attempt using max_tokens) is estimated before any call.
If it exceeds the cap (USD 2,00) the run aborts. The run also stops before a call that could take spend past the cap.
Key: PORTFOLIO_ANTHROPIC_KEY. If it is missing, no call is made: the inputs are written and the run log says so.
Never reads the answer key or the name-origin file.
"""
import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from check_summaries import check_draft  # noqa: E402
from fmt import date_dk, eur, eur_short, month_label  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "data" / "export"
AI = ROOT / "data" / "ai"
PROMPT_FILE = ROOT / "prompts" / "case_summary_v1.md"
PROMPT_VERSION = "v1"
MODEL = "claude-haiku-5-5"
PRICE_IN, PRICE_OUT = 0.10 / 1e6, 0.50 / 1e6  # USD per token, Claude Haiku 5.5 list price (prompts under 100k tokens)
MAX_TOKENS = 2000
MAX_RETRIES = 2
CAP_USD = 2.00
MAX_TX_SHOWN = 25
LABEL = {"salary": "salary", "family_support": "family support", "savings": "savings",
         "business_payments": "business payments", "private": "private", "small_business": "small business"}


class CaseDraft(BaseModel):
    summary: str
    suggestion: Literal["escalate", "close as false positive"]
    reasons: list[str]
    missing: list[str]


def money(x):
    return {"eur": round(x, 2), "display": eur(x), "short": eur_short(x)}


def load(name):
    return json.loads((EXPORT / f"{name}.json").read_text(encoding="utf-8"))


def build_inputs():
    cases, meta = load("cases"), load("meta")
    customers = {c["customer_id"]: c for c in load("customers")}
    tx = {t["transaction_id"]: t for t in load("transactions")}
    trig = {}
    for ct in load("case_transactions"):
        trig.setdefault(ct["case_id"], []).append(ct)
    inputs = []
    for c in cases:
        cust = customers[c["customer_id"]]
        lines = sorted((tx[t["transaction_id"]] | {"rules": t["rules"]} for t in trig[c["case_id"]]), key=lambda t: t["ts"])
        assert all(t["ts"][:10] <= c["case_date"] for t in lines), c["case_id"]  # no look-ahead
        shown = sorted(sorted(lines, key=lambda t: -t["amount_eur"])[:MAX_TX_SHOWN], key=lambda t: t["ts"])
        ins = [t for t in lines if t["direction"] == "in"]
        outs = [t for t in lines if t["direction"] == "out"]
        expected = c["expected_monthly_volume_eur"]
        avg90 = c["avg_monthly_volume_90d_eur"]
        inp = {
            "case_id": c["case_id"],
            "case_date": date_dk(c["case_date"]), "case_date_iso": c["case_date"], "case_month": month_label(c["case_month"]),
            "first_alert_date": date_dk(c["first_alert_date"]),
            "risk_score": c["risk_score"],
            "customer": {
                "customer_id": cust["customer_id"], "customer_type": LABEL[cust["customer_type"]],
                "customer_since": date_dk(cust["onboarding_date"]), "declared_purpose": LABEL[cust["declared_purpose"]],
                "declared_expected_monthly_volume": money(expected),
                "home_country": cust["home_country"], "home_country_risk_tier": cust["home_country_tier"],
                "kyc_risk_rating": cust["kyc_risk_rating"],
            },
            "rules_hit": [{"rule": a["rule_id"], "name": a["rule_name"], "alert_date": date_dk(a["alert_date"]),
                           "how_the_rule_works": meta["rules"][a["rule_id"]]["how"], "reason": a["reason"]}
                          for a in c["alerts"]],
            "triggering_transactions_total": {
                "count": len(lines), "money_in": money(sum(t["amount_eur"] for t in ins)), "count_in": len(ins),
                "money_out": money(sum(t["amount_eur"] for t in outs)), "count_out": len(outs),
                "different_counterparties": len({t["counterparty_id"] for t in lines}),
            },
            "triggering_transactions": [{
                "date": date_dk(t["ts"]), "time": t["ts"][11:16], "direction": t["direction"], "amount": money(t["amount_eur"]),
                "counterparty": ("customer's own account at another bank" if t["counterparty_id"].startswith("OWN-")
                                 else "cash agent" if t["counterparty_id"].startswith("AGENT") else "other party"),
                "counterparty_country": t["counterparty_country"], "country_risk_tier": t["country_tier"],
                "channel": t["channel"].replace("_", " "), "rules": t["rules"]} for t in shown],
            "normal_activity_90_days_before_first_alert": {
                "transactions": c["tx_90d"], "money_in": money(c["in_90d_eur"]), "money_out": money(c["out_90d_eur"]),
                "average_monthly_volume": money(avg90),
                "average_monthly_volume_as_pct_of_declared": f"{round(100 * avg90 / expected)} %",
                "different_counterparties": c["counterparties_90d"], "largest_transaction": money(c["largest_tx_90d_eur"]),
                "transfers_to_high_risk_tier_countries": c["high_tier_tx_90d"],
            },
        }
        if len(lines) > len(shown):
            rest = [t for t in lines if t not in shown]
            inp["triggering_transactions_not_listed"] = {"count": len(rest), "total": money(sum(t["amount_eur"] for t in rest)),
                                                         "note": "smallest transactions left out to keep the input short"}
        inputs.append(inp)
    return inputs


def user_message(inp):
    payload = {k: v for k, v in inp.items() if k != "case_date_iso"}
    return "Case data (JSON):\n" + json.dumps(payload, ensure_ascii=False, indent=1)


def est_tokens(text):
    return len(text) / 3  # conservative: JSON with numbers is about 3-4 characters per token


def worst_case_cost(inputs, system):
    """3 attempts per case; attempt k sends the input plus the earlier drafts and feedback; every output = max_tokens."""
    total = 0.0
    for inp in inputs:
        base = est_tokens(system) + est_tokens(user_message(inp))
        for k in range(1, MAX_RETRIES + 2):
            total += (base + (k - 1) * (MAX_TOKENS + 300)) * PRICE_IN + MAX_TOKENS * PRICE_OUT
    return total


def feedback(failed):
    return ("Your draft failed these automatic checks:\n- " + "\n- ".join(failed) +
            "\nWrite the whole JSON again and fix every point. Use only numbers exactly as they appear in the case data.")


ATTEMPT_COLS = ["case_id", "attempt", "created_at", "model", "prompt_version", "input_tokens", "output_tokens",
                "cost_usd", "passed", "failed_checks", "output_json"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    system = PROMPT_FILE.read_text(encoding="utf-8")
    inputs = build_inputs()
    (AI / "prompts").mkdir(parents=True, exist_ok=True)
    with (AI / "prompts" / "inputs.jsonl").open("w", encoding="utf-8") as f:
        for inp in inputs:
            f.write(json.dumps(inp, ensure_ascii=False) + "\n")
    (AI / "prompts" / "system_prompt_v1.md").write_text(system, encoding="utf-8")
    estimate = worst_case_cost(inputs, system)
    print(f"{len(inputs)} cases. Worst-case estimate (3 attempts each, every output {MAX_TOKENS} tokens): "
          f"USD {estimate:.2f}; cap USD {CAP_USD:.2f}.")
    if args.dry_run:
        return print("Dry run: inputs written to data/ai/prompts/inputs.jsonl, no API call.")

    log = {"model": MODEL, "prompt_version": PROMPT_VERSION, "cases": len(inputs), "cap_usd": CAP_USD,
           "worst_case_estimate_usd": round(estimate, 4), "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    key = os.environ.get("PORTFOLIO_ANTHROPIC_KEY", "").strip()
    if not key:
        log |= {"status": "skipped: PORTFOLIO_ANTHROPIC_KEY not set; prompts written to data/ai/prompts/"}
        (AI / "run_log.json").write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
        return print(log["status"])
    if estimate > CAP_USD:
        log |= {"status": f"aborted: worst-case estimate USD {estimate:.2f} is above the cap"}
        (AI / "run_log.json").write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
        sys.exit(log["status"])
    if (AI / "summaries.json").exists():
        sys.exit("data/ai/summaries.json exists: this run is done once. Delete it deliberately to run again.")

    import anthropic
    # gzip only: the local Brotli 1.0.9 cannot decode the SDK's brotli responses (TypeError in httpx2).
    client = anthropic.Anthropic(api_key=key, default_headers={"Accept-Encoding": "gzip, deflate"})
    del key
    spent, calls, tok_in, tok_out = 0.0, 0, 0, 0
    summaries, stopped = [], None
    worst_call = max(worst_case_cost([i], system) for i in inputs) / (MAX_RETRIES + 1) * 2  # generous single-call bound
    with (AI / "summary_attempts.csv").open("w", encoding="utf-8", newline="") as fa:
        writer = csv.DictWriter(fa, fieldnames=ATTEMPT_COLS)
        writer.writeheader()
        for n, inp in enumerate(inputs, 1):
            messages = [{"role": "user", "content": user_message(inp)}]
            first_passed, out, failed = None, None, None
            for attempt in range(1, MAX_RETRIES + 2):
                if spent + worst_call > CAP_USD:
                    stopped = f"stopped before {inp['case_id']}: spend USD {spent:.4f} plus one more call could pass the cap"
                    break
                try:
                    resp = client.messages.parse(model=MODEL, max_tokens=MAX_TOKENS, system=system, messages=messages,
                                                 output_format=CaseDraft, output_config={"effort": "low"})
                except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError) as e:
                    stopped = f"stopped at {inp['case_id']}: {type(e).__name__}"
                    break
                calls += 1
                cost = resp.usage.input_tokens * PRICE_IN + resp.usage.output_tokens * PRICE_OUT
                spent += cost
                tok_in += resp.usage.input_tokens
                tok_out += resp.usage.output_tokens
                parsed = resp.parsed_output
                if parsed is None:
                    out, failed = {}, [f"no valid JSON returned (stop_reason {resp.stop_reason})"]
                    text = "".join(b.text for b in resp.content if b.type == "text")
                else:
                    out = parsed.model_dump()
                    failed = check_draft(out, inp)
                    text = json.dumps(out, ensure_ascii=False)
                writer.writerow({"case_id": inp["case_id"], "attempt": attempt,
                                 "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": MODEL,
                                 "prompt_version": PROMPT_VERSION, "input_tokens": resp.usage.input_tokens,
                                 "output_tokens": resp.usage.output_tokens, "cost_usd": f"{cost:.6f}",
                                 "passed": not failed, "failed_checks": " | ".join(failed), "output_json": text})
                fa.flush()
                if first_passed is None:
                    first_passed = not failed
                if not failed:
                    break
                messages += [{"role": "assistant", "content": text or "{}"}, {"role": "user", "content": feedback(failed)}]
            if stopped and out is None:
                break
            if out:
                summaries.append({"case_id": inp["case_id"], "model": MODEL, "prompt_version": PROMPT_VERSION,
                                  "attempts": attempt, "first_attempt_passed": first_passed,
                                  "output": out, "check": {"passed": not failed, "failed": failed}})
            print(f"[{n}/{len(inputs)}] {inp['case_id']} attempts {attempt} {'PASS' if not failed else 'FAIL'} "
                  f"spend USD {spent:.4f}", flush=True)
            if stopped:
                break

    (AI / "summaries.json").write_text(json.dumps(summaries, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    log |= {"status": stopped or "complete", "drafts": len(summaries), "api_calls": calls, "input_tokens": tok_in,
            "output_tokens": tok_out, "spend_usd": round(spent, 4),
            "first_attempt_passed": sum(bool(s["first_attempt_passed"]) for s in summaries),
            "final_passed": sum(s["check"]["passed"] for s in summaries),
            "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    (AI / "run_log.json").write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
    new = not (AI / "spend_log.csv").exists()
    with (AI / "spend_log.csv").open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["finished_at", "project", "model", "api_calls", "input_tokens", "output_tokens", "spend_usd"])
        w.writerow([log["finished_at"], "aml-queue", MODEL, calls, tok_in, tok_out, f"{spent:.4f}"])
    print(json.dumps(log, indent=2))


if __name__ == "__main__":
    main()
