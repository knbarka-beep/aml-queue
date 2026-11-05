# AML Alert Queue

A compliance dashboard for a fictional Danish payment company, Lysbro Pay ApS (fictional). Rules flag suspicious transfers, alerts are grouped into cases, and AI drafts a case summary with a suggested next step (escalate or close as false positive) for an analyst to confirm. It is a portfolio project for AML/KYC, compliance, risk and fintech roles: a hiring manager should understand it in two minutes.

Write code, docs and commits in British English.

## Who you work with

Knut is an economics master's student who builds finance tools with AI. He is not a developer. Prefer simple, readable choices he can explain in an interview, and explain each choice in a sentence or two.

## Fixed rules (absolute)

- **All data is synthetic.** The company is "Lysbro Pay ApS (fictional)". Every page and the README say so. Customer names are invented; foreign countries are invented (Veltria, Norsala, ...), so no real country is labelled high-risk.
- **Nothing from any real employer:** no rules, thresholds, routines, systems or wording. Every threshold and risk weight is an own assumption, listed in `docs/assumptions.md` and set in `config/rules.yaml`. Do not cite laws, FATF lists or regulators for specific numbers unless the exact source can be named; otherwise call it an assumption.
- **The answer key (`data/truth/`) is read only by `scripts/evaluate.py`** (and written by `scripts/generate.py`). Rules, the AI script and the dashboard export never read it, except the aggregate scores in `data/eval/scores.json`. `tests/test_truth_access.py` enforces this.
- **Name origin is for the fairness check only.** It lives in `data/fairness/` and is never shown, nor used by rules or the AI. Suspicious behaviour must not correlate with name origin, nationality or any personal trait.
- **No look-ahead.** A case has a fixed alert date; nothing in the case, its AI input or its drill-down uses data after that date.
- **AI suggests, an analyst decides.** AI text never says someone is a criminal or that a crime happened; it describes behaviour.
- **No claims the numbers do not support.** No time-saved or AI-quality claims that are not measured. Report weak results as they are.
- **Evaluation rules, prompts and rules never change after the result has been seen.** One prompt version per run.
- **Formats:** EUR, European numbers (1.234,56 and €1,2k), dates 31.12.2026 or Sep 2026. No em dashes in any text.
- **API key** is read from `PORTFOLIO_ANTHROPIC_KEY`. Never print, write or commit it. Spend cap for this project: USD 2,00.
- **Git:** commit with the GitHub noreply address only. Do not push, add a remote or deploy without Knut asking.

## Ask first

Before anything that costs money beyond the cap, needs a login, publishes anything, deletes data, or changes what is measured.

## Pipeline

See README.md ("How to run"). `scripts/run_all.py` runs everything except the AI calls.

## Where the details are

`docs/explain.md` (start here), `docs/decisions.md`, `docs/assumptions.md`, `docs/metrics.md`, `docs/data-spec.md`, `config/rules.yaml`.
