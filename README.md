# AML Alert Queue: Lysbro Pay ApS (fictional)

A compliance dashboard for a fictional Danish payment company: rules flag suspicious transfers, AI drafts a case note and suggests a next step, an analyst decides. **All data is synthetic.**

**Live:** https://lysbro-aml.vercel.app · **Case sheet:** [docs/case-sheet.md](docs/case-sheet.md)

![Alert queue, Sep 2026](docs/screenshots/desktop-light.png)

## The problem

A payment company must watch its transfers for signs of money laundering. Rules catch suspicious-looking behaviour, but most alerts turn out to be ordinary: a car purchase, a seasonal business, a bonus month. Analysts read every case to decide what to escalate. This project builds that workflow end to end and tests one question: can AI draft the case note and a suggested next step without inventing anything?

## What the dashboard shows

- **Four KPIs** for the selected month: AI suggests escalation (16 of 26 cases in Sep 2026), cases this month vs last month, rule precision and planted patterns caught.
- **The alert queue**: cases sorted by risk score, with rules hit, amount, the AI suggestion and the status "Awaiting analyst". Filters by rule and AI suggestion.
- **Drill-down**: customer profile, declared purpose vs actual behaviour, a timeline with the triggering transactions highlighted, the rules hit, and the AI draft with its checklist and check result. "AI suggestion only. An analyst decides."
- **Rule performance**: cases per rule, truly suspicious vs false positive, and the AI suggestion against the truth.
- **How this works**: data, rules, risk score, AI checks, evaluation, fairness check and limitations.

## How it is built

```
scripts/generate.py      2.000 invented customers, 74.228 transfers (Jan-Sep 2026), 30 planted suspicious customers
scripts/reconcile.py     PASS/FAIL checks: no negative balances, row counts, fairness check
sql/ (DuckDB)            one view per file: six rules, alerts, cases, risk score, KPIs, checks
scripts/build_db.py      builds the database from the CSVs and config/rules.yaml, exports JSON to web/data/
scripts/write_summaries.py   Claude drafts one case note per case (run once, stored in data/ai/)
scripts/check_summaries.py   checks every draft without AI
scripts/evaluate.py      the only script that reads the answer key; writes aggregate scores only
web/                     Next.js static site with Recharts; no API calls at runtime
```

Every threshold and weight is an own assumption, set in `config/rules.yaml` and listed in `docs/assumptions.md`. None comes from a regulator or an employer.

## The rules and how they perform

Thirty suspicious customers were planted in six patterns. Six of them show only a weak version, built to sit just under a threshold. The rules raised 183 cases. 34 were truly suspicious: precision 18,6 %. They caught 27 of the 30 planted customers (recall 90,0 %): all 24 full versions and 3 of the 6 weak ones.

| Rule | Cases | Customers (planted) | Truly suspicious cases | Precision | Its pattern caught |
|---|---:|---:|---:|---:|---:|
| R1 Structuring | 15 | 15 (7) | 7 | 46,7 % | 6 of 7 |
| R2 Pass-through | 18 | 18 (5) | 5 | 27,8 % | 4 of 5 |
| R3 Fan-in | 15 | 15 (15) | 15 | 100,0 % | 5 of 5 |
| R4 Volume spike | 97 | 97 (27) | 27 | 27,8 % | 5 of 5 |
| R5 High-risk corridor | 64 | 43 (6) | 6 | 9,4 % | 5 of 7 |
| R6 Purpose mismatch | 11 | 11 (11) | 11 | 100,0 % | 6 of 6 |

A case can hit several rules. R4 and R5 have the most false-positive cases (70 and 58). They are the rules to tune first.

## The AI part

For each case, `claude-haiku-5-5` sees the customer profile, the rules hit with their reasons, the triggering transfers and a summary of the 90 days before the first alert. It does not see the name, the name-origin group, anything after the case date or the answer key. Amounts come pre-formatted, so the model copies numbers instead of calculating them. It returns a 60-100 word summary, a suggestion (escalate or close as false positive), 1-3 reasons and a checklist for the analyst. It never decides.

**Checked without AI.** Every number must appear in the case data. No date may be after the case date. Fields, word limits and banned words are checked too. A failing draft gets one follow-up listing the failures, with at most two retries. 134 of 183 drafts passed on the first attempt (73,2 %) and 178 of 183 after retries (97,3 %).

**Evaluated against the planted truth.** The metrics were fixed before the AI ran.

| | AI: escalate | AI: close |
|---|---:|---:|
| Truly suspicious | 30 | 4 |
| Not suspicious | 70 | 79 |

If an analyst reviewed only the cases the AI suggests escalating: 100 of 183 cases reviewed, 30 of 34 truly suspicious cases found, 4 missed. In AML a missed case costs more than a false positive, so the AI is used to order the queue, not to close cases.

**Cost:** USD 0,15 for the complete run of 243 calls, and about USD 0,16 in total.

## Limitations

- The data is synthetic. R3 and R6 at 100 % precision are an artefact of how normal customers were generated. Real data would not be this clean.
- The AI run: the first launch made no calls (a compression bug). The second crashed after 11 cases (a script bug). The 11 drafts were archived unread, the script was fixed, and the full run was done once with the unchanged prompt, checks and cap.
- 5 of 183 drafts still fail the check after retries (word limit only, 101-103 words). They are shown as failing.
- One run, one prompt version. Variation between runs is not measured.
- The fairness check covers name origin only, on 25 to 90 cases per group. It is reported, not tested statistically. The planted customers match everyone else's name-origin mix within 1,6 points.
- Thresholds and risk weights are own assumptions. 183 cases is fewer than planned; the thresholds were not loosened to reach more.
- No analyst decisions exist. The queue shows suggestions only, and precision and recall come from an answer key. No time saving is claimed.
- The counterparty network shows one customer and their counterparties (90 days up to the case date, at most 25 nodes). Every counterparty in the synthetic data belongs to one customer, so no links between customers appear.

## Next version

- A threshold slider per rule for rule tuning, tested on one period and checked on another.
- An analyst feedback loop: decisions in the queue, and precision measured from them.
- Linking customers through shared counterparties in data that has them (the network view supports it; this synthetic data has none).

## How to run

```
pip install -r requirements.txt
python scripts/run_all.py                    # data, checks, rules, evaluation, export (no AI calls)
python scripts/write_summaries.py --dry-run  # AI inputs and worst-case cost, no calls
cd web && npm ci && npm run build            # static site in web/out
node tests/qa_edge.mjs                       # from the project folder: UI checks in headless Edge
```

The AI drafts are stored in `data/ai/`. The script refuses to run again while they exist. Background for every formula is in `docs/explain.md`.

---

Built with Claude Code by Knut Barka, an economics student who builds finance tools with AI.
