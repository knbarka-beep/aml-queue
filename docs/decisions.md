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

## Stage 3: AI case summaries (committed before the run)

- **Model `claude-haiku-5-5`, effort `low`, max 2.000 output tokens.** Cheapest current model; the task is a short structured summary from pre-formatted numbers. Alternative: Sonnet 5.5 at 20 times the price; not needed for this.
- **Structured output** via `client.messages.parse(output_format=CaseDraft)`: the API returns JSON matching the schema, so "required fields" rarely fail; the other checks still run.
- **Input**: case data from `data/export/` only (no name, no name origin). Amounts as `{eur, display, short}` so the model can copy a display form. Counterparty ids are replaced by a type ("customer's own account at another bank", "cash agent", "other party"), so the text is about behaviour, not ids. At most 25 triggering transactions are listed (the largest), the rest as a count and total.
- **Checks** (`scripts/check_summaries.py`): fields, word limits (summary 60-100, reasons at most 25 words each, 1-3 reasons, 1-4 missing items), "[Analyst: ...]" format, every number in the input within the rounding shown, no date or month after the case date, banned words. Added to the prompt's list: "crime", "launder" in any form, and the em dash (house rule).
- **Retry rule**: on failure one follow-up message lists the failed checks; at most 2 retries; the last attempt is kept even if it still fails, and is marked as failing on the dashboard. Every attempt is stored in `data/ai/summary_attempts.csv`.
- **Cost cap USD 2,00.** Worst-case estimate before calling: 3 attempts per case, every attempt using all 2.000 output tokens, input estimated at 3 characters per token: USD 0,78 for 183 cases. During the run, the script stops before any call that could take spend past the cap. Price: USD 0,10 / 0,50 per million input / output tokens.
- **Run once.** The script refuses to run if `data/ai/summaries.json` already exists.
- **Prompt inputs are written to `data/ai/prompts/inputs.jsonl` on every run**, so anyone can see exactly what the model saw.

## Stage 3: what happened in the run

- **First launch: 0 API calls.** The local Brotli 1.0.9 package cannot decode the SDK's compressed responses (TypeError inside httpx2). Fix: the client asks for gzip only (`Accept-Encoding: gzip, deflate`). No environment change. Committed before relaunching.
- **Second launch crashed after 11 cases.** One reply was cut off at the 2.000-token limit and `messages.parse` raised a validation error the script did not catch. This was a bug in the script, not in the prompt or rules. Fix: use `messages.create` with a JSON schema and treat a cut-off reply as a failed, logged attempt that gets the normal retry. The 15 attempts of the crashed run are kept in `data/ai/crashed_run_attempts.csv` and its spend (USD 0,0080, plus one unlogged cut-off call of at most about USD 0,0013) is in `data/ai/spend_log.csv`. Nobody looked at or scored those 11 drafts.
- **Complete run, once:** 183 drafts, 243 API calls, USD 0,1481. Prompt, checks, retry rule and cap unchanged from the committed versions. Total spend for the project: about USD 0,16, against a cap of USD 2,00.
- **Number check:** 134 of 183 drafts passed every check on the first attempt (73,2 %), 178 of 183 after retries (97,3 %). The 5 that still fail are only over the word limit (101-103 words). They are kept, as the retry rule says, and the dashboard marks them as failing. First-attempt failures: summary length 27, reason longer than 25 words 22, a number not in the input 13, four reasons instead of three 5, reply cut off 2.

## Stage 4: results (reported as they came out; nothing changed afterwards)

- **Rules:** 183 cases, 34 truly suspicious: precision 18,6 %. Recall 27 of 30 planted customers (90,0 %): all 24 full versions, 3 of 6 weak versions. Missed by primary pattern: one pass-through, two high-risk corridor. No case fell on a planted customer before the pattern started.
- **Per rule** (cases / truly suspicious / precision / planted customers with the pattern caught by that rule): R1 15 / 7 / 46,7 % / 6 of 7; R2 18 / 5 / 27,8 % / 4 of 5; R3 15 / 15 / 100 % / 5 of 5; R4 97 / 27 / 27,8 % / 5 of 5; R5 64 / 6 / 9,4 % / 5 of 7; R6 11 / 11 / 100 % / 6 of 6.
- **AI suggestion vs truth:** of 34 truly suspicious cases, 30 suggested for escalation (88,2 %), 4 suggested for closing (the costly error). Of 149 false positives, 79 suggested for closing (53,0 %), 70 for escalation.
- **Fairness (aggregate):** share of cases per name-origin group is within 3 points of the group's share of customers; AI escalation rate per group 48,5-58,8 %. With 25-90 cases per group these differences are within what chance produces; reported, not tested statistically.
- R3 and R6 at 100 % precision is a feature of synthetic data: normal customers in the generator rarely have many senders or counterparties. Real data would not be this clean.

## Stage 5: dashboard

- **Same stack and versions as project 2** (Next.js 16.4.4, React 19.3, Recharts 3), installed from its lockfile. Static export with `trailingSlash: true`.
- **The queue shows cases raised in the selected month** (26 in Sep 2026); a checkbox adds earlier open cases. The "Open cases" KPI is the backlog at month end, which equals all cases so far because no analyst decisions exist; the KPI explanation says so.
- **High risk = score 60 or more** (own assumption), the only place besides "Escalate" that uses red.
- **Plain `<a>` link to "How this works".** Next's static export writes the page's prefetch file under a different name than the client asks for, which caused a 404 in the console. A plain link does a normal page load. The back link to the queue uses `Link`, whose files exist.
- **Drill-down timeline** covers 90 days before the first alert up to the case date, so the drill-down never shows data after the case date either.
- **QA in headless Edge** (`tests/qa_edge.mjs`, Node and the DevTools protocol, no new dependency): 26 of 26 checks pass: fictional labels, four KPIs, queue sorted by risk, filter, Tab reaches every control with a visible focus ring, Enter opens a case, the "AI suggestion only. An analyst decides." line, timeline renders, Esc closes, dark mode, rule performance tab with the 2x2 table, How this works page, no horizontal scroll at 375 px (page and drill-down), no console errors. First-run failures were a test bug (Enter without a key text), a grid overflow at 375 px, a missing favicon and the prefetch 404; all fixed.

## Ship run (05.11.2026, after the chat review)

No change to the generator, seed, data, `config/rules.yaml`, rule SQL, the prompt, `data/ai/` outputs or `check_summaries.py`. No API calls.

- **A1. "Open cases" replaced by "AI suggests escalation"** (x of n cases raised in the selected month). Sep 2026: 16 of 26. Computed in the page from `cases.json`; the old SQL column `open_cases_month_end` stays in `sql/14_v_monthly_kpis.sql` but is no longer shown.
- **A2. Trade-off line computed from `data/eval/scores.json`** in the page, not typed in: 100 of 183 cases reviewed, 30 of 34 truly suspicious cases found, 4 missed. Same as the figures in the ship prompt.
- **A3. Customers column.** `evaluate.py` now also writes, per rule, the number of distinct customers and how many of them are planted. This adds two output fields; no existing metric or definition changed (checked: every other value in `scores.json` is identical before and after). It had to be `evaluate.py`, because it is the only script allowed to read the answer key. The dashboard reads the fields from `meta.scores`, so no SQL changed. Result: cases and customers are equal for every rule except R5 (64 cases on 43 customers, 6 planted). The ship prompt's example ("R3: 15 cases" from one planted customer) does not hold in the files: R3's 15 cases are on 15 different customers. Logged as a difference, the file values are shown.
