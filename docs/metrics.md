# Metrics

Every formula used on the dashboard and in the evaluation, with the file that computes it. Fixed on 05.11.2026 before any AI call was made and before any rule was scored against the answer key.

## Dashboard KPIs

| KPI | Formula | File |
|---|---|---|
| AI suggests escalation | cases raised in the selected month (case date in the month) whose AI draft suggests "escalate", shown as "x of n cases". Suggestions only; no analyst decisions exist in this demo. Replaced "Open cases" on 05.11.2026, which always equalled the cumulative backlog. | `web/components/KpiRow.tsx`, from `web/data/cases.json` |
| Cases this month | cases whose case date falls in the selected month, compared with the month before | `sql/14_v_monthly_kpis.sql` |
| Rule precision | cases on a truly suspicious customer / all cases, Apr-Sep 2026 | `scripts/evaluate.py` -> `data/eval/scores.json` |
| Planted patterns caught (recall) | planted customers with at least one true-positive case / all planted customers | `scripts/evaluate.py` |

## Risk score

risk_score = min(100, rule points + KYC points + amount points), rounded to a whole number. Rule points = sum of weights of the distinct rules in the case; KYC points = 0 / 10 / 20; amount points = 20 x min(1, amount involved / (5 x expected monthly volume)). File: `sql/11_v_cases.sql`. Weights in `config/rules.yaml`.

## Evaluation (`scripts/evaluate.py`, the only reader of `data/truth/`)

**True-positive case**: a case on a planted customer whose case date is on or after the date the planted pattern started. A case on a planted customer before the pattern started is a false positive (the rule fired on normal behaviour).

Rules:
- **Precision per rule** = true-positive cases containing the rule / all cases containing the rule.
- **Overall precision** = true-positive cases / all cases.
- **Recall** = planted customers with at least one true-positive case / all planted customers (30). Also shown per primary pattern and for full vs weak versions.
- **Recall per rule** (the rule built for the pattern): planted customers with that pattern caught by a true-positive case containing that rule / planted customers with that pattern.

AI suggestion vs truth, on cases with an AI draft:
- **Escalation rate on truly suspicious cases** = true-positive cases the AI suggests escalating / true-positive cases. A missed escalation is the costly error.
- **Close rate on false positives** = false-positive cases the AI suggests closing / false-positive cases. This is analyst time saved only if the analyst agrees; no time saving is claimed.
- **2x2 table**: rows = truly suspicious / not suspicious; columns = AI suggests escalate / close.

Number check (`scripts/check_summaries.py`, no AI):
- **First-attempt pass rate** = cases whose first attempt passes every check / cases.
- **Final pass rate** = cases whose kept attempt passes every check / cases.

Fairness (aggregate, `scripts/evaluate.py`): case rate and AI escalation rate per name-origin group, reported, not used anywhere else.

## Rules for this run

- One prompt version (`prompts/case_summary_v1.md`). Prompts, rules and these metrics are not changed after the results are seen.
- The results are reported as they come out.

## Added on 05.11.2026 after the review (no existing metric changed)

- **Customers per rule**: distinct customers with at least one case containing the rule, and how many of them are planted. Written by `scripts/evaluate.py` as `customers` and `planted_customers` per rule. Precision stays per case.
- **Trade-off line**: if an analyst reviewed only the cases the AI suggests escalating: reviewed = suspicious_escalate + not_suspicious_escalate; found = suspicious_escalate of (suspicious_escalate + suspicious_close); missed = suspicious_close. Computed from the 2x2 table in `data/eval/scores.json`.
