# Assumptions

Every threshold, weight and risk tier below is an **own assumption** for a fictional company. None is taken from a law, a regulator, a FATF list or any real employer. All of them are set in one file, `config/rules.yaml`; change them there and rerun `python scripts/run_all.py`.

## Countries and risk tiers

| Country | Tier | Note |
|---|---|---|
| Denmark | domestic | home market, no risk tier |
| Elsmark, Tarvenn, Lunora | low | invented |
| Norsala, Bresken | medium | invented |
| Veltria, Quorvia | high | invented |

The countries are invented so that no real country is labelled high-risk.

## KYC risk rating

low, medium or high per customer, drawn at random (70 / 22 / 8 %); small businesses are a little more often medium, and a home country in the high tier means high. In a real firm this would come from onboarding. The rating has the same distribution for planted and normal customers.

## Rules

| Rule | Fires when (all within the window, looking back from a transfer) | Weight |
|---|---|---|
| R1 Structuring | at least 3 transfers, in or out, from €8.500 (85 % of €10.000) up to but not including €10.000, within 7 days | 30 |
| R2 Pass-through | at an outgoing transfer: money in from at least 3 different senders, at least €3.000 in total, and money out at least 80 % of it, all within 48 hours | 35 |
| R3 Fan-in | at least 8 different senders within 30 days (small business: 25) | 25 |
| R4 Volume spike | volume (in + out) in 30 days at least 4 times the larger of the declared monthly volume and the customer's own average month in the 90 days before, and at least €5.000 | 20 |
| R5 High-risk corridor | transfers out to high-tier countries within 30 days: at least €5.000 in total, or at least 3 transfers | 30 |
| R6 Purpose mismatch | private customer with declared purpose savings or family support and at least 12 different counterparties (in and out) within 30 days | 20 |

The €10.000 in R1 is a "reporting-style threshold": a round number of the kind a firm might watch. It is not presented as any actual legal limit.

## Alerts and cases

- **Cooldown 30 days**: a rule alerts again on the same customer only after it has been quiet for more than 30 days. Without it, a rule that stays true for weeks would raise an alert every day.
- **Case grouping 14 days**: alerts on one customer within 14 days of the previous alert form one case. The case date is the date of the last alert in it.
- **Only Apr-Sep 2026 alerts.** Jan-Mar 2026 is baseline history.

## Risk score (0-100)

score = min(100, rule points + KYC points + amount points)

- rule points: sum of the weights of the distinct rules in the case (table above),
- KYC points: low 0, medium 10, high 20,
- amount points: 20 x min(1, amount involved / (5 x expected monthly volume)); "amount involved" is the sum of the triggering transactions.

The weights reflect a judgement that moving money through an account quickly (R2) or to a high-risk corridor (R5) or just under a threshold (R1) is more telling than volume alone (R4) or a purpose mismatch alone (R6). They were set before any result was seen and are not fitted to the planted data.

## AI

- Model: `claude-haiku-5-5` (cheap, good enough for short structured summaries), effort `low`.
- Spend cap: USD 2,00 for this project; the run aborts if the worst-case estimate (3 attempts for every case) is above it.
- Price used for the estimate and the spend log: USD 0,10 per million input tokens, USD 0,50 per million output tokens (Anthropic list price for Claude Haiku 5.5, prompts under 100.000 tokens).
