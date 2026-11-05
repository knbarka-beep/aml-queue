"""Checks on the AI case drafts, without AI.

Each draft must:
  1. have all fields: summary, suggestion ("escalate" / "close as false positive"), 1-3 reasons, 1-4 missing items;
  2. keep the word limits: summary 60-100 words, each reason at most 25 words;
  3. write every missing item as "[Analyst: ...]";
  4. use only numbers that appear in the case input (amounts within the rounding shown, counts exactly);
  5. mention no date after the case date (31.12.2026 dates and "Sep 2026" months);
  6. avoid the banned words and em dashes.

write_summaries.py calls check_draft() after every attempt. Run on its own to re-check the stored drafts:
  python scripts/check_summaries.py
Reads data/ai/prompts/inputs.jsonl, data/ai/summaries.json and data/ai/summary_attempts.csv. Never reads the answer key.
"""
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI = ROOT / "data" / "ai"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

BANNED = [r"\bexciting\b", r"\bsignificant(ly)?\b", r"\brobust\b", r"\bseamless(ly)?\b", r"\bleverag\w*",
          r"\blandscape\b", r"\bclearly\b", r"\bobviously\b", r"\bcriminal\w*", r"\bguilt(y)?\b", r"\bcrime\w*",
          r"\bmoney laundering\b", r"\blaunder\w*", "—"]
DATE = re.compile(r"\b(\d{2})\.(\d{2})\.(\d{4})\b")
MONTH = re.compile(r"\b(" + "|".join(MONTHS) + r")\w* (\d{4})\b")
ID = re.compile(r"\b(?:CASE-|OWN-)?[A-Z]{1,6}\d+\b|\b\d{2,3}-day\b")  # ids like C01686, CP012345, R2; "90-day"
NUMBER = re.compile(r"(?P<eur>€\s?)?(?P<num>\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)"
                    r"(?:\s?(?P<unit>%|k\b|m\b|per cent|times\b))?")


def parse_numbers(text):
    """Numbers in European format: '€9.450' -> 9450, '€9,5k' -> 9500, '92,3 %' -> 92.3, '11,9 times' -> 11.9.
    Dates and ids are removed first."""
    text = ID.sub(" ", MONTH.sub(" ", DATE.sub(" ", text)))
    found = []
    for m in NUMBER.finditer(text):
        whole, _, dec = m["num"].replace(".", "").partition(",")
        value = float(whole + ("." + dec if dec else ""))
        scale = {"k": 1e3, "m": 1e6}.get(m["unit"] or "", 1) if m["eur"] else 1
        found.append({"text": m.group(0).strip(), "value": value * scale,
                      "precision": 0.5 * 10 ** -len(dec) * scale + 0.006})
    return found


def input_numbers(obj):
    """Every number in the input, including numbers inside strings and keys (counts in reasons, '90' in '90 days')."""
    if isinstance(obj, bool) or obj is None:
        return []
    if isinstance(obj, (int, float)):
        return [abs(float(obj))]
    if isinstance(obj, str):
        return [n["value"] for n in parse_numbers(obj)] + [float(x) for x in re.findall(r"\d+", obj)]
    if isinstance(obj, dict):
        return [n for k, v in obj.items() for n in input_numbers(k) + input_numbers(v)]
    return [n for item in obj for n in input_numbers(item)]


def words(s):
    return len(s.split())


def check_draft(out, inp):
    """Returns the list of failed checks (empty = pass). `out` is the parsed draft, `inp` the case input."""
    failed = []
    for f in ("summary", "suggestion", "reasons", "missing"):
        if f not in out or out[f] in (None, "", []):
            failed.append(f"missing field: {f}")
    if failed:
        return failed
    if out["suggestion"] not in ("escalate", "close as false positive"):
        failed.append(f"suggestion must be 'escalate' or 'close as false positive', got '{out['suggestion']}'")
    n = words(out["summary"])
    if not 60 <= n <= 100:
        failed.append(f"summary has {n} words, must be 60-100")
    if not 1 <= len(out["reasons"]) <= 3:
        failed.append(f"{len(out['reasons'])} reasons, must be 1-3")
    for r in out["reasons"]:
        if words(r) > 25:
            failed.append(f"reason longer than 25 words: '{r[:60]}...'")
    if not 1 <= len(out["missing"]) <= 4:
        failed.append(f"{len(out['missing'])} missing items, must be 1-4")
    for m in out["missing"]:
        if not re.fullmatch(r"\[Analyst: [^\]]+\]", m.strip()):
            failed.append(f"missing item not written as '[Analyst: ...]': '{m[:60]}'")

    text = " ".join([out["summary"], *out["reasons"], *out["missing"]])
    candidates = input_numbers(inp)
    for f in parse_numbers(text):
        if not any(abs(f["value"] - c) <= f["precision"] for c in candidates):
            failed.append(f"number not in the input: '{f['text']}'")

    case_date = date.fromisoformat(inp["case_date_iso"])
    for d, m, y in DATE.findall(text):
        try:
            if date(int(y), int(m), int(d)) > case_date:
                failed.append(f"date after the case date: {d}.{m}.{y}")
        except ValueError:
            failed.append(f"invalid date: {d}.{m}.{y}")
    for mon, y in MONTH.findall(text):
        if (int(y), MONTHS.index(mon[:3]) + 1) > (case_date.year, case_date.month):
            failed.append(f"month after the case date: {mon} {y}")
    for pattern in BANNED:
        hit = re.search(pattern, text, re.IGNORECASE)
        if hit:
            failed.append(f"banned word: '{hit.group(0)}'")
    return failed


def self_test():
    inp = {"case_date_iso": "2026-08-12", "amount": {"eur": 9450.3, "display": "€9.450", "short": "€9,5k"},
           "reason": "3 transfers between €8.500 and €10.000 within 7 days", "pct": "92,3 %"}
    good = {"summary": " ".join(["word"] * 55) + " three transfers of €9.450 (€9,5k) at 92,3 % on 10.08.2026 in Aug 2026.",
            "suggestion": "escalate", "reasons": ["3 transfers within 7 days"], "missing": ["[Analyst: confirm source of funds]"]}
    assert check_draft(good, inp) == [], check_draft(good, inp)
    bad = dict(good, summary=good["summary"].replace("€9.450", "€9.999").replace("10.08.2026", "14.08.2026") + " clearly",
               missing=["confirm source of funds"])
    f = check_draft(bad, inp)
    assert any("€9.999" in x for x in f) and any("14.08.2026" in x for x in f) and any("clearly" in x for x in f)
    assert any("[Analyst" in x for x in f)
    assert parse_numbers("€1,2k and C01686 and 90-day") == [{"text": "€1,2k", "value": 1200.0, "precision": 50.006}]


def main():
    self_test()
    print("check_summaries.py self-test: PASS")
    summaries_file = AI / "summaries.json"
    if not summaries_file.exists():
        print("No AI drafts yet (data/ai/summaries.json missing): nothing to check.")
        return
    inputs = {}
    with (AI / "prompts" / "inputs.jsonl").open(encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            inputs[d["case_id"]] = d
    summaries = json.loads(summaries_file.read_text(encoding="utf-8"))
    with (AI / "summary_attempts.csv").open(encoding="utf-8", newline="") as f:
        attempts = list(csv.DictReader(f))
    first = {a["case_id"]: a for a in attempts if a["attempt"] == "1"}
    final_ok = 0
    reasons = {}
    for s in summaries:
        failed = check_draft(s["output"], inputs[s["case_id"]])
        final_ok += not failed
        for x in failed:
            key = x.split(":")[0]
            reasons[key] = reasons.get(key, 0) + 1
        if failed != s["check"]["failed"]:
            print(f"  {s['case_id']}: stored check result differs from the re-check: {failed}")
    first_ok = sum(1 for cid, a in first.items() if a["passed"] == "True")
    n = len(summaries)
    print(f"Drafts: {n} of {len(inputs)} cases")
    print(f"First attempt passed every check: {first_ok} of {len(first)}")
    print(f"Kept attempt passes every check:  {final_ok} of {n}")
    for k, v in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"  still failing: {k} ({v})")


if __name__ == "__main__":
    main()
    sys.exit(0)
