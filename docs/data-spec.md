# Data spec: synthetic data for Lysbro Pay ApS (fictional)

All data is invented by `scripts/generate.py` (fixed seed 20260405). No real customer, company or transaction is behind it.

## Period

- **Apr-Sep 2026**: the six months the rules alert on and the dashboard shows.
- **Jan-Mar 2026**: baseline history only. The volume-spike rule (R4) compares a customer with their own previous 90 days, so April needs three months before it. No alert is dated before 01.04.2026.

## Customers (`data/raw/customers.csv`, 2.000 rows)

| Column | Meaning |
|---|---|
| customer_id | C00001 ... C02000 |
| name | invented from four syllable sets, see below |
| customer_type | private (about 82 %) or small_business (about 18 %) |
| onboarding_date | between 01.01.2018 and 31.10.2025 |
| declared_purpose | private: salary 45 %, family_support 25 %, savings 30 %; business: business_payments |
| expected_monthly_volume_eur | what the customer declared at onboarding, money in plus money out per month |
| home_country | Denmark 85 %, otherwise an invented country |
| kyc_risk_rating | low 70 %, medium 22 %, high 8 %; businesses are a little more often medium; a home country in the high tier means high |
| opening_balance_eur | balance on 01.01.2026 |

**Name origin.** Each customer gets one of four invented name-origin groups (shares 45 / 22 / 18 / 15 %), drawn independently of every other attribute. The group is written only to `data/fairness/name_origin.csv`. Rules, the AI and the dashboard never see it. It exists to show that suspicious behaviour does not follow name origin.

## Transactions (`data/raw/transactions.csv`)

transaction_id, timestamp (minute), customer_id, direction (in/out), amount_eur, counterparty_id, counterparty_country, channel (app, card_top_up, bank_transfer, cash_agent). `OWN-Cxxxxx` is the customer's own account at another bank; `AGENT...` is a cash agent.

## Normal behaviour

- **Salary**: monthly salary in from one employer (23rd-27th), rent out on the 1st, about half moved to the customer's own bank account, a few small app payments to 2-5 friends.
- **Family support**: one top-up a month from the customer's own account, sent on within a week to one or two family recipients abroad. Some recipients live in a high-tier invented country (legitimate, and a source of false positives for R5).
- **Savings**: one deposit a month; a withdrawal in about 10 % of months.
- **Small business**: 10-50 clients paying in, 4-15 suppliers paid out (30 % abroad, 6 % of businesses have a supplier in a high-tier country). 15 % deposit cash through agents (EUR 1.000-9.900, a source of false positives for R1).
- **Low activity**: 8 % of private customers barely use the account.

Ordinary but unusual-looking behaviour, so the rules produce realistic false positives:
- bonus month (12 % of salary customers, 1-2,5 times salary, Apr-Sep),
- holiday spending abroad in July (half of private customers),
- one-off car purchase (4 % of private customers, EUR 8.000-25.000, funded from the customer's own account a few days before),
- seasonal businesses (20 %): two to three times the usual activity in July and August.

**Balances never go negative.** An outgoing transfer larger than the balance is cut to the balance (dropped if under EUR 10). The generator reports how many were cut.

## Planted suspicious customers (`data/truth/planted.csv`, 30 rows)

The only truth file. Columns: customer_id, patterns (one or two, joined by +), primary_pattern, strength (full/weak), start_date.

- **Who**: 30 customers drawn by stratified sampling over name-origin group, so the planted set has the same name-origin mix as everyone else (checked in the generator, written to `data/checks/fairness.json`).
- **Patterns**: five customers per primary pattern. Six customers also show a second pattern (full strength). Six customers show only a weak version of their primary pattern, built to fall just under the rule threshold, so the rules may miss them.
- **Start**: a random date between 01.04.2026 and 05.09.2026 (from 01.06.2026 for dormant-then-spike, so there are quiet months first).

| # | Pattern | Full version | Weak version |
|---|---|---|---|
| 1 | Structuring | two bursts of 4-5 deposits at 86-99,5 % of EUR 10.000 within 3-5 days, mostly via cash agents, then most of it sent to a medium-tier country | one burst of 2 deposits within 6 days |
| 2 | Pass-through (mule) | 2-3 cycles: 6-10 senders pay EUR 400-2.500 within 20 hours, 85-97 % goes out 22-40 hours after the first payment to 1-2 recipients | one cycle, 3 senders of EUR 300-700 |
| 3 | Fan-in | 15-25 new senders, EUR 100-900 each, within 20 days | 7 senders within 30 days |
| 4 | Dormant then spike | quiet since January, then 8-15 times the declared monthly volume in and out within 10 days | 2,5-3,5 times |
| 5 | High-risk corridor | 3-5 transfers of EUR 1.500-6.000 to a high-tier country within 25 days, each funded the day before | 1-2 transfers of EUR 600-1.200 |
| 6 | Purpose mismatch | declared savings or family support, but 20-35 new counterparties in and out within 4 weeks | 9-11 counterparties |

Pass-through and fan-in are planted only on private customers; purpose mismatch only on savings or family-support customers.
