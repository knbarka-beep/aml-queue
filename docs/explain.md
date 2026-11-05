# Explain: how the AML alert queue works, and how to talk about it

Written for Knut, to learn the project after the build. All data is fictional (Lysbro Pay ApS (fictional)). Every number below comes from the one run on 05.11.2026.

## 1. The story in four sentences

1. Rules flag transfers that look suspicious; alerts on one customer within 14 days become one case (183 cases, Apr-Sep 2026).
2. Most cases are false positives (149 of 183), which is normal for rule-based monitoring and the reason analysts exist.
3. For each case, Claude drafts a short note and suggests escalate or close; a script without AI checks every number and date in the draft.
4. Because the data is synthetic with planted suspicious customers, we can measure how good the rules and the AI suggestions are: precision 18,6 %, recall 90 %, AI escalates 30 of 34 truly suspicious cases.

## 2. The pipeline, file by file

| Step | File | What it does |
|---|---|---|
| Data | `scripts/generate.py` | 2.000 customers, 74.228 transactions (Jan-Mar baseline + Apr-Sep), 30 planted suspicious customers in `data/truth/planted.csv`, name origin in `data/fairness/name_origin.csv`, fairness check |
| Checks | `scripts/reconcile.py` | balances never negative, every transaction has a customer, row counts, countries, fairness: all PASS |
| Rules | `sql/02-07` | one view per rule (R1-R6), every setting from `config/rules.yaml` |
| Alerts, cases | `sql/08-11` | cooldown, case grouping, risk score |
| Export | `scripts/build_db.py` | builds `data/aml.duckdb`, runs `sql/16_v_checks.sql` (8 checks, all PASS), writes JSON to `web/data/` |
| AI | `scripts/write_summaries.py` | one draft per case, validate and retry, cost cap |
| AI checks | `scripts/check_summaries.py` | numbers, dates, fields, length, banned words |
| Evaluation | `scripts/evaluate.py` | the only reader of the answer key; writes aggregate scores to `data/eval/scores.json` |
| Dashboard | `web/` | Next.js static site, reads `web/data/*.json` |
| Tests | `tests/test_truth_access.py`, `tests/qa_edge.mjs`, `web/lib/format.test.ts` | answer key and name origin stay hidden; UI checks; number formats |

## 3. The KPIs

| KPI | Formula | File | Sep 2026 |
|---|---|---|---|
| AI suggests escalation | cases raised in the month whose AI draft says "escalate" / all cases raised in the month | `web/components/KpiRow.tsx` | 16 of 26 |
| Cases this month | cases with case date in the month; compared with the month before | same view, `cases_in_month`, `cases_prev_month` | 26 (−10 vs Aug) |
| Rule precision | truly suspicious cases / all cases, Apr-Sep | `scripts/evaluate.py` | 18,6 % (34 of 183) |
| Planted patterns caught | planted customers with a truly suspicious case / 30 | `scripts/evaluate.py` | 27 of 30 (90,0 %) |

**Why not "open cases"**: the first version showed the open backlog, but nobody decides any case in this demo, so it always equalled every case so far (183) and said nothing. "AI suggests escalation" shows how much of the month the AI would push forward. It is a suggestion count, not a decision count.

**Why precision and recall are not per month**: with 34 truly suspicious cases in total, monthly figures would swing on one or two cases. Six months together is more honest.

**"Truly suspicious" (true positive)**: a case on a planted customer, dated on or after the day the planted pattern started. Fixed in `docs/metrics.md` before the AI ran.

## 4. The rules

All thresholds are own assumptions in `config/rules.yaml`. Each rule is evaluated at every relevant transaction, looking back over its window; the alert date is the date of the transaction that tips it over, so an alert never uses later data.

| Rule | Fires when | Why this design | Result |
|---|---|---|---|
| R1 Structuring (`sql/02`) | 3+ transfers from €8.500 to just under €10.000 within 7 days | splitting amounts to stay under a threshold is a classic pattern; 85 % of the threshold catches "just under" | 15 cases, 46,7 % precision. False positives: businesses depositing cash through agents |
| R2 Pass-through (`sql/03`) | at an outgoing transfer: 3+ senders, at least €3.000 in, and at least 80 % out again, all within 48 hours | money mules receive from many and pass it on fast | 18 cases, 27,8 %. False positives: busy businesses paying suppliers right after clients pay |
| R3 Fan-in (`sql/04`) | 8+ different senders in 30 days (business: 25) | a private account rarely receives from many unrelated people | 15 cases, 100 %. Too clean: normal synthetic customers rarely have many senders |
| R4 Volume spike (`sql/05`) | 30-day volume at least 4 times the larger of declared monthly volume and own 90-day average, and at least €5.000 | comparing with the customer's own history, not one fixed amount, fits small and large customers | 97 cases, 27,8 %. Biggest source of false positives: car purchases, bonuses, seasonal peaks |
| R5 High-risk corridor (`sql/06`) | to high-tier countries within 30 days: €5.000+ in total or 3+ transfers | exposure to high-risk jurisdictions is a standard risk factor | 64 cases, 9,4 %. Legitimate family support and suppliers in high-tier countries |
| R6 Purpose mismatch (`sql/07`) | savings or family-support customer with 12+ counterparties in 30 days | KYC says one thing, behaviour says another | 11 cases, 100 %. Again too clean on synthetic data |

**Precision per case and per customer**: precision counts cases, and one customer can have several cases from the same rule, so the Rule performance table also shows distinct customers per rule and how many were planted; here only R5 differs (64 cases on 43 customers, 6 of them planted, so 9,4 % per case and 14,0 % per customer).

**Alerts** (`sql/08`): a rule alerts again on the same customer only after 30 quiet days. **Cases** (`sql/09`): alerts on one customer within 14 days of each other form one case; the case date is the last alert's date. **Recall per pattern**: all 24 full versions caught; 3 of 6 weak versions caught (by design they sit just under a threshold of their own rule; the 3 caught were picked up by a case after the pattern started).

### The trade-off (computed from the 2x2 table)

If an analyst reviewed only the cases the AI suggests escalating: 100 of 183 cases reviewed, 30 of 34 truly suspicious cases found, 4 missed. In AML a missed case costs more than a false positive, so the AI is used to order the queue, not to close cases. Formula: reviewed = AI escalate on suspicious (30) + AI escalate on not suspicious (70); found = 30 of (30 + 4); missed = AI close on suspicious (4). Shown in the Rule performance tab (`web/components/RulePerformance.tsx`), computed in the page from `data/eval/scores.json`.

## 5. The risk score (`sql/11_v_cases.sql`)

risk score = min(100, rule points + KYC points + amount points)

- rule points: sum of the weights of the distinct rules in the case (R1 30, R2 35, R3 25, R4 20, R5 30, R6 20),
- KYC points: low 0, medium 10, high 20,
- amount points: 20 x min(1, amount involved / (5 x declared monthly volume)).

Why a weighted sum: it is transparent, each part can be shown in the drill-down ("rule points 20 + KYC 20 + amount 20 = 60"), and the weights are easy to argue about. A machine-learning score would need labelled history this firm does not have. The queue shows 60 or more in red as high risk.

## 6. The charts

- **Drill-down timeline** (`web/components/Timeline.tsx`): one dot per transaction from 90 days before the first alert to the case date; money in above zero, out below; triggering transactions in blue. It answers "is this new for this customer?" at a glance.
- **Cases per rule** (`web/components/RulePerformance.tsx`): horizontal stacked bars, truly suspicious (blue) and false positive (grey) per rule. It tells the false-positive story: R4 and R5 make most of the noise.
- **2x2 table**: AI suggestion vs truth. A table, not a chart, because four numbers are read more precisely as numbers.

## 7. The AI part

- **Input** (`write_summaries.py`, `build_inputs`): profile (no name, no name origin), rules with reasons, up to 25 triggering transactions, 90-day summary. Amounts as `{eur, display, short}`. Inputs are stored in `data/ai/prompts/inputs.jsonl`.
- **Prompt**: `prompts/case_summary_v1.md`. Describe behaviour only, copy numbers, never claim a crime, suggest only.
- **Output**: summary (60-100 words), suggestion, 1-3 reasons, "[Analyst: ...]" checklist. JSON enforced by the API's structured output.
- **Checks** (`check_summaries.py`): numbers within the rounding shown, no date after the case date, fields, length, banned words. Result: 134 of 183 first attempt, 178 of 183 final. The 5 failures are 101-103 words.
- **Cost**: worst case estimated at USD 0,78 before calling; actual USD 0,15 (complete run), about USD 0,16 in total.

## 8. Twelve interview questions, with honest answers

**1. Why is precision so low, and is that bad?**
18,6 % means about four in five cases were not suspicious. In transaction monitoring that is normal: rules are set to catch most real cases, so they also catch ordinary behaviour that looks similar (a car purchase looks like a volume spike). Low precision is a cost (analyst time), not a failure, as long as recall is high. The useful question is where the false positives come from: here R4 (70 of 97 cases false) and R5 (58 of 64). Those are the rules to tune first.

**2. Which error is worse in AML, a missed escalation or a false positive?**
A missed escalation. A false positive costs an analyst some minutes; a missed suspicious case can mean the firm processes criminal money, with regulatory and reputational consequences. That is why the AI only suggests, and why I report its escalation rate on truly suspicious cases first: 30 of 34. The 4 it would have closed are exactly why an analyst must decide.

**3. How do you know the AI is not biased?**
By design and by measurement, within limits. By design: the AI never sees the name or the name-origin group, and the planted suspicious customers have the same name-origin mix as everyone else (largest difference 1,6 points). Measured: per name-origin group the share of cases stays within 3 points of the share of customers, and the AI escalation rate per group is between 48,5 % and 58,8 %, differences that chance can produce with these group sizes. The limit: on real data, nationality correlates with home country and transfer corridors, so a "neutral" rule like R5 can still hit some groups more. That needs monitoring on real data.

**4. Why does the AI only suggest?**
Three reasons. Accountability: an escalation decision has legal weight and must be owned by a person. Error profile: it would have closed 4 of 34 truly suspicious cases. Missing information: the AI only sees transactions; the analyst can check source of funds, call the customer or look at documents. That is what the "[Analyst: ...]" checklist is for.

**5. What would change with real data?**
No answer key, so precision and recall come from analyst decisions and later outcomes (for example reports filed). Behaviour is messier, so R3 and R6 would not stay at 100 %. Thresholds would need tuning per segment. Data quality issues (missing counterparty countries, duplicates) appear. And privacy rules decide what the AI may see and where it runs.

**6. How would you tune a rule without overfitting to the planted cases?**
Tune on one period and check on another (for example Apr-Jun vs Jul-Sep), look at precision and recall together rather than one number, change one threshold at a time, and decide what "good enough" means before looking. Above all, do not tune on the same cases you report: here I fixed every threshold before seeing any result, and did not change them even though the case count (183) came out below the "few hundred" aimed for.

**7. Why rules and not machine learning?**
Rules are explainable to an analyst and a regulator ("three transfers just under €10.000 in a week"), need no labelled history, and are easy to change. Machine learning needs labelled cases, which a young firm does not have. A sensible next step is to use analyst decisions to train a model that ranks cases inside the queue, while the rules still decide what enters it.

**8. How do you stop the AI from inventing numbers?**
The numbers are calculated in Python and SQL and given to the model already formatted; the prompt says to copy them; and a script checks every number in the draft against the input, allowing only the rounding shown. A draft that fails gets one follow-up with the list of failures. 13 first attempts had a number not in the input; after retries none of the kept drafts does.

**9. What does the AI see, and why not more?**
Profile, rules with reasons, triggering transactions and a 90-day summary, all up to the case date. Not the name (irrelevant to behaviour and a bias risk), not the name-origin group, nothing after the case date (that would be look-ahead: the analyst would not have it either), and not the answer key (the evaluation would prove nothing).

**10. How do you know the evaluation is fair?**
The answer key is read by one script only, and a test (`tests/test_truth_access.py`) fails if any other script mentions or opens it. The metrics were committed before the AI ran. One prompt, one run, results reported as they came out, including the weak parts (5 drafts over the word limit, 4 missed escalations, 3 missed planted customers).

**11. How much does this cost, and would it scale?**
USD 0,15 for 183 drafts with a small model, about USD 0,0008 per case. At 10.000 cases a month that is roughly USD 8 in API cost; the real cost is analyst time. Before scaling I would measure time per case with and without the draft; I have not measured that, so I claim no time saving.

**12. What would you build next?**
A threshold slider showing how precision and recall move, analyst decisions in the queue with a feedback loop, a network view to find shared senders across mule accounts, and an analyst review of a sample of AI drafts to measure quality beyond agreement with the answer key.

## 9. Five things to look at first

1. The drill-down of a high-risk case (for example CASE-0158) and a closed false positive: does the AI draft read like something an analyst would sign?
2. The Rule performance tab: be ready to explain why R4 and R5 make most of the noise.
3. `config/rules.yaml` and `docs/assumptions.md`: every number is yours to defend.
4. `tests/test_truth_access.py`: the reason anyone should believe the scores.
5. `docs/decisions.md`, "Stage 3: what happened in the run": the two failed launches and how they were handled.
