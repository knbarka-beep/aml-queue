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
