# Decisions log

Small choices made during the unattended build on 05.11.2026, with the reason and the alternative.

## Stage 1: data

- **Python from the system install, no virtual environment.** duckdb, pandas, pyyaml, pydantic and anthropic were already there; `requirements.txt` lists them. Alternative: a `.venv` like project 2; skipped because nothing needed installing.
- **Jan-Mar 2026 generated as baseline history.** R4 compares 30 days with the customer's own previous 90 days, so April needs history. Alerts start 01.04.2026. Alternative: compare only with the declared volume in the first months; rejected because the rule would change behaviour in June.
- **Transaction count.** 50.646 in Apr-Sep (inside the 40.000-70.000 range) plus 23.582 in the Jan-Mar baseline, 74.228 in total.
- **Countries.** Denmark is the home market with no risk tier ("domestic"). Every foreign country is invented with a tier set in `config/rules.yaml`, so no real country is labelled high-risk. Alternative: invent the home market too; rejected because the company is Danish.
- **Name origin is drawn independently of every other attribute**, including home country and KYC rating, and stored in a separate file (`data/fairness/name_origin.csv`) so no other script loads it by accident. In real life name origin and nationality correlate; here the point is to show that the rules and the AI do not depend on it.
- **Planted customers chosen by stratified sampling over name-origin group** (largest remainder), then checked: no group differs by more than 5 percentage points from the whole customer base. Result: PASS, largest difference 1,6 points. Alternative: a plain random sample and a statistical test; with 30 customers a random sample can differ by 15 points by chance, which would make the check noisy.
- **KYC rating of planted customers follows the same distribution as everyone else.** Otherwise the KYC part of the risk score would quietly point at the answer.
- **Weak versions are built just under the rule thresholds**, so the expected misses are by design and documented in `docs/data-spec.md`. The thresholds in `config/rules.yaml` were written before the data was generated and were not changed afterwards.
- **Fairness check result lives in `data/checks/fairness.json`.** The prompt asks for the check in the generator; `reconcile.py` reads the result file so that it never has to open `data/truth/`.
- **Outgoing transfers larger than the balance are cut to the balance** (1.401 of 74.228). Simple way to keep balances non-negative; alternative was to top accounts up, which would invent extra inflows.

## Stage 2: rules and alerts

- **Rules as SQL views** (`sql/02-07`), one per rule, all settings read from a one-row `params` table that `build_db.py` fills from `config/rules.yaml`. Alternative: Python functions; SQL keeps the "one view per file" pattern from the other projects and each rule can be read on its own.
- **Each rule is evaluated at every relevant transaction, looking back over its window.** The alert date is the date of the transaction that tips it over. Nothing after that date can enter the alert.
- **Cooldown of 30 days per rule and customer.** Without it, a rule that stays true (a busy business, a corridor customer) would raise an alert every day.
- **Case date = date of the last alert in the case.** The case collects alerts within 14 days of each other; using the last alert date means the case contains exactly the information known when it was complete, and nothing later.
- **Case count: 183 (from 220 alerts)**, below the "few hundred" aimed for. Not changed: the thresholds were fixed before the run, and raising the count by loosening rules after seeing it would be tuning. Reported as it is.
- **`run_rules.py` is a thin wrapper** that builds the database and prints alerts and cases per rule; the rules live in SQL so there is one place to read them.
- **The truth-access test** (`tests/test_truth_access.py`) has a static part (no source file may name the truth folder or the name-origin file, except `generate.py` and `evaluate.py`) and a runtime part (build_db.py, check_summaries.py and write_summaries.py --dry-run run under a Python audit hook that raises on any read inside `data/truth/` or `data/fairness/`). A last test proves the hook catches a read.
- **R4 in early April**: the 90-day baseline before an early-April alert reaches back into December 2025, where there is no data, so the baseline is understated by up to a third. The declared volume acts as a floor, so this only matters for customers whose own activity is above their declared volume. Left as a known limitation.
- **The rule-performance view joins aggregate scores** written by `evaluate.py` (`data/eval/scores.json`): per rule counts and percentages, never which cases are planted.

## Stage 4 pre-registration (written before any AI call or scoring)

The metrics in `docs/metrics.md` are fixed as of this commit: true-positive definition (planted customer, case date on or after the pattern start), precision per rule and overall, recall overall and per pattern, AI escalation rate on true positives, AI close rate on false positives, the 2x2 table, number-check pass rates first attempt and final. One prompt version. No changes after the results are seen.
