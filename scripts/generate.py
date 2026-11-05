"""Generate the synthetic data for Lysbro Pay ApS (fictional).

Writes:
  data/raw/customers.csv        customer profiles (no name origin)
  data/raw/transactions.csv     Jan-Sep 2026 (Jan-Mar is baseline history only)
  data/fairness/name_origin.csv customer_id -> invented name-origin group (fairness check only)
  data/truth/planted.csv        the planted suspicious customers (the ONLY truth file)
  data/checks/fairness.json     result of the fairness check (planted vs everyone, name-origin mix)
  data/checks/generate_report.json  row counts and other facts reconcile.py checks

Every number below was fixed before the rules were run. See docs/data-spec.md.
Run from the project folder:  python scripts/generate.py
"""
import csv
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CFG = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))
rng = random.Random(20260405)

HISTORY_START = date.fromisoformat(CFG["period"]["history_start"])
START = date.fromisoformat(CFG["period"]["start"])
END = date.fromisoformat(CFG["period"]["end"])
MONTHS = [date(2026, m, 1) for m in range(HISTORY_START.month, END.month + 1)]
N_CUSTOMERS = 2000
N_PLANTED = 30
PATTERNS = ["structuring", "pass_through", "fan_in", "dormant_spike", "high_risk_corridor", "purpose_mismatch"]
COUNTRIES = CFG["countries"]
BY_TIER = {t: [c for c, tier in COUNTRIES.items() if tier == t] for t in ("low", "medium", "high")}
THRESHOLD = CFG["rules"]["R1"]["threshold_eur"]

# ------------------------------------------------------------------ invented names
# Four invented syllable sets. They only stand in for "names of different origins"; none copies a real language.
NAME_GROUPS = {
    "group_a": (["Ka", "Lo", "Mi", "Sva", "Tor", "Ul", "Bje", "Fre"], ["rin", "lan", "dis", "ve", "mund", "ja", "rik"],
                ["Holm", "Strand", "Vik", "Lund", "Berg", "Dal"], ["gaard", "by", "sted", "rup", "holt"]),
    "group_b": (["A", "Da", "Ri", "Sa", "Na", "Ze", "Ha"], ["mir", "lia", "yan", "rek", "dun", "sa"],
                ["Ol", "Ka", "Ab", "Mer", "Ta", "Ez"], ["darin", "uzi", "basar", "ivan", "elim"]),
    "group_c": (["Lu", "Ma", "Pe", "Ce", "Vi", "Ro"], ["cia", "tteo", "dro", "lina", "ren", "vio"],
                ["Bel", "Cas", "Mon", "Ser", "Var"], ["lotti", "trano", "dieri", "veno", "acci"]),
    "group_d": (["Ji", "Ko", "Tae", "Min", "Hu", "Shi"], ["n", "ro", "yun", "wei", "ka", "lan"],
                ["Ta", "Sa", "Ha", "Ki", "No"], ["moda", "kura", "shiro", "yan", "gawa"]),
}
GROUP_WEIGHTS = {"group_a": 0.45, "group_b": 0.22, "group_c": 0.18, "group_d": 0.15}


def invented_name(group):
    f1, f2, s1, s2 = NAME_GROUPS[group]
    return f"{rng.choice(f1)}{rng.choice(f2)} {rng.choice(s1)}{rng.choice(s2)}"


# ------------------------------------------------------------------ helpers
_cp = 0


def new_cp(prefix="CP"):
    """A new counterparty id."""
    global _cp
    _cp += 1
    return f"{prefix}{_cp:06d}"


def rand_day(start, end):
    return start + timedelta(days=rng.randrange((end - start).days + 1))


def month_end(m):
    return (m.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)


def eur(x):
    return round(x, 2)


TX = []  # (customer_id, datetime, direction, amount, counterparty_id, counterparty_country, channel, tag)


def tx(cust, day, direction, amount, cp, country, channel, tag="normal", hour=None):
    if day < HISTORY_START or day > END or amount <= 0:
        return
    ts = datetime(day.year, day.month, day.day, hour if hour is not None else rng.randint(7, 22), rng.randint(0, 59))
    TX.append([cust["customer_id"], ts, direction, eur(amount), cp, country, channel, tag])


# ------------------------------------------------------------------ customers
def make_customers():
    customers, origins = [], {}
    groups = list(GROUP_WEIGHTS)
    for i in range(1, N_CUSTOMERS + 1):
        cid = f"C{i:05d}"
        group = rng.choices(groups, weights=GROUP_WEIGHTS.values())[0]  # independent of everything else
        origins[cid] = group
        ctype = "small_business" if rng.random() < 0.18 else "private"
        if ctype == "private":
            purpose = rng.choices(["salary", "family_support", "savings"], weights=[45, 25, 30])[0]
        else:
            purpose = "business_payments"
        home = "Denmark" if rng.random() < 0.85 else rng.choice(BY_TIER["low"] * 4 + BY_TIER["medium"] * 2 + BY_TIER["high"])
        kyc = rng.choices(["low", "medium", "high"], weights=[70, 22, 8])[0]
        if ctype == "small_business" and kyc == "low" and rng.random() < 0.3:
            kyc = "medium"
        if COUNTRIES[home] == "high":
            kyc = "high"
        c = {"customer_id": cid, "name": invented_name(group), "customer_type": ctype,
             "onboarding_date": rand_day(date(2018, 1, 1), date(2025, 10, 31)).isoformat(),
             "declared_purpose": purpose, "home_country": home, "kyc_risk_rating": kyc}
        # Behaviour parameters (not exported): monthly amounts behind the declared volume.
        if purpose == "salary":
            c["_salary"] = rng.randrange(2200, 5600, 100)
            c["expected_monthly_volume_eur"] = round(c["_salary"] * 2, -2)
        elif purpose == "family_support":
            c["_monthly"] = rng.randrange(300, 1600, 50)
            c["expected_monthly_volume_eur"] = round(c["_monthly"] * 2, -2)
        elif purpose == "savings":
            c["_monthly"] = rng.randrange(200, 1600, 50)
            c["expected_monthly_volume_eur"] = round(c["_monthly"] * 1.2, -2)
        else:
            c["expected_monthly_volume_eur"] = rng.randrange(8000, 60001, 1000)
        c["_low_activity"] = ctype == "private" and rng.random() < 0.08
        c["opening_balance_eur"] = eur(rng.uniform(5000, 30000) if ctype == "small_business" else rng.uniform(200, 3000))
        customers.append(c)
    return customers, origins


# ------------------------------------------------------------------ normal behaviour
def normal_private(c):
    cid = c["customer_id"]
    own = f"OWN-{cid}"  # the customer's own account at another bank
    friends = [new_cp() for _ in range(rng.randint(2, 5))]
    family = [new_cp() for _ in range(rng.choice([1, 1, 2]))]
    fam_country = c["home_country"] if c["home_country"] != "Denmark" else rng.choice(
        BY_TIER["low"] * 5 + BY_TIER["medium"] * 3 + BY_TIER["high"] * 1)  # some legitimate family support goes to high-tier countries
    landlord, employer = new_cp(), new_cp()
    bonus_month = rng.choice(MONTHS[3:]) if rng.random() < 0.12 else None
    car_month = rng.choice(MONTHS[3:]) if rng.random() < 0.04 else None
    for m in MONTHS:
        last = month_end(m)
        if c["_low_activity"]:
            if rng.random() < 0.5:
                tx(c, rand_day(m, last), "in", rng.uniform(20, 150), own, "Denmark", "bank_transfer")
            if rng.random() < 0.3:
                tx(c, rand_day(m, last), "out", rng.uniform(10, 80), rng.choice(friends), "Denmark", "app")
            continue
        p = c["declared_purpose"]
        if p == "salary":
            pay = c["_salary"] * rng.uniform(0.97, 1.03)
            tx(c, m.replace(day=rng.randint(23, 27)), "in", pay, employer, "Denmark", "bank_transfer", hour=6)
            if m == bonus_month:
                tx(c, m.replace(day=rng.randint(23, 27)), "in", c["_salary"] * rng.uniform(1.0, 2.5), employer, "Denmark", "bank_transfer", "bonus", hour=6)
            tx(c, m.replace(day=1), "out", c["_salary"] * rng.uniform(0.28, 0.38), landlord, "Denmark", "bank_transfer")
            tx(c, m.replace(day=rng.randint(26, 28)), "out", pay * rng.uniform(0.4, 0.6), own, "Denmark", "bank_transfer")
        elif p == "family_support":
            amt = c["_monthly"] * rng.uniform(0.8, 1.2)
            day = m.replace(day=rng.randint(1, 20))
            tx(c, day, "in", amt, own, "Denmark", rng.choice(["bank_transfer", "card_top_up"]))
            n = rng.choice([1, 1, 2])
            for k in range(n):
                tx(c, day + timedelta(days=rng.randint(0, 6)), "out", amt / n * rng.uniform(0.9, 1.0),
                   family[k % len(family)], fam_country, "app")
        elif p == "savings":
            tx(c, m.replace(day=rng.randint(1, 28)), "in", c["_monthly"] * rng.uniform(0.7, 1.3), own, "Denmark", "bank_transfer")
            if rng.random() < 0.1:
                tx(c, rand_day(m, last), "out", c["_monthly"] * rng.uniform(0.5, 2), own, "Denmark", "bank_transfer")
        for _ in range(rng.choice([0, 1, 1, 2])):  # small payments to friends
            tx(c, rand_day(m, last), "out", rng.uniform(15, 250), rng.choice(friends), "Denmark", "app")
        if m.month == 7 and rng.random() < 0.5:  # holiday spending abroad
            for _ in range(rng.randint(1, 3)):
                tx(c, rand_day(m, last), "out", rng.uniform(50, 600), new_cp(), rng.choice(BY_TIER["low"]), "app", "holiday")
        if m == car_month:  # one-off car purchase, funded from the customer's own account
            price = rng.randrange(8000, 25001, 500)
            day = rand_day(m, last - timedelta(days=5))
            tx(c, day, "in", price, own, "Denmark", "bank_transfer", "car_purchase", hour=9)
            tx(c, day + timedelta(days=rng.randint(1, 4)), "out", price, new_cp(), "Denmark", "bank_transfer", "car_purchase", hour=15)


def normal_business(c):
    vol = c["expected_monthly_volume_eur"] / 2  # in and out each about half the declared volume
    clients = [new_cp() for _ in range(rng.randint(10, 50))]
    suppliers = [new_cp() for _ in range(rng.randint(4, 15))]
    supplier_country = {s: "Denmark" if rng.random() < 0.7 else rng.choice(BY_TIER["low"] + BY_TIER["medium"]) for s in suppliers}
    if rng.random() < 0.06:  # a legitimate supplier in a high-tier country
        supplier_country[suppliers[0]] = rng.choice(BY_TIER["high"])
    seasonal = rng.random() < 0.2
    cash = rng.random() < 0.15  # some businesses deposit cash through agents
    for m in MONTHS:
        last = month_end(m)
        factor = rng.uniform(2.0, 3.0) if seasonal and m.month in (7, 8) else rng.uniform(0.8, 1.2)
        n_in = max(1, round(rng.randint(3, 7) * factor))
        for _ in range(n_in):
            if cash and rng.random() < 0.4:
                tx(c, rand_day(m, last), "in", rng.uniform(1000, 9900), new_cp("AGENT"), "Denmark", "cash_agent")
            else:
                tx(c, rand_day(m, last), "in", vol * factor / n_in * rng.uniform(0.5, 1.5), rng.choice(clients), "Denmark", "bank_transfer")
        n_out = rng.randint(2, 5)
        for _ in range(n_out):
            s = rng.choice(suppliers)
            tx(c, rand_day(m, last), "out", vol * factor / n_out * rng.uniform(0.5, 1.3), s, supplier_country[s], "bank_transfer")


# ------------------------------------------------------------------ planted patterns
def plant(c, pattern, strength, start):
    """Add one suspicious pattern from `start`. strength 'weak' is a milder version the rules may miss."""
    weak = strength == "weak"
    cid, own = c["customer_id"], f"OWN-{c['customer_id']}"
    tag = f"planted_{pattern}"
    if pattern == "structuring":
        for b in range(1 if weak else 2):
            day0 = start + timedelta(days=b * rng.randint(15, 25))
            n = 2 if weak else rng.randint(4, 5)
            span = 6 if weak else rng.randint(3, 5)
            total = 0
            for _ in range(n):
                amt = rng.uniform(0.86, 0.995) * THRESHOLD
                total += amt
                tx(c, day0 + timedelta(days=rng.randint(0, span)), "in", amt, new_cp("AGENT"), "Denmark",
                   rng.choice(["cash_agent", "cash_agent", "bank_transfer"]), tag)
            tx(c, day0 + timedelta(days=span + rng.randint(2, 6)), "out", total * rng.uniform(0.8, 0.95), new_cp(),
               rng.choice(BY_TIER["medium"]), "bank_transfer", tag)
    elif pattern == "pass_through":
        for k in range(1 if weak else rng.randint(2, 3)):
            day0 = start + timedelta(days=k * rng.randint(9, 16))
            n, lo, hi = (3, 300, 700) if weak else (rng.randint(6, 10), 400, 2500)
            t0 = datetime(day0.year, day0.month, day0.day, 8)
            total = 0
            for _ in range(n):
                amt = rng.uniform(lo, hi)
                total += amt
                t = t0 + timedelta(hours=rng.uniform(0, 20))
                TX.append([cid, t.replace(second=0, microsecond=0), "in", eur(amt), new_cp(), "Denmark", rng.choice(["app", "bank_transfer"]), tag])
            recips = [new_cp() for _ in range(rng.choice([1, 2]))]
            out_total = total * rng.uniform(0.85, 0.97)
            for j, r in enumerate(recips):
                t = t0 + timedelta(hours=rng.uniform(22, 40))
                country = rng.choice(["Denmark"] + BY_TIER["medium"])
                TX.append([cid, t.replace(second=0, microsecond=0), "out", eur(out_total / len(recips)), r, country, "bank_transfer", tag])
    elif pattern == "fan_in":
        n, days = (7, 30) if weak else (rng.randint(15, 25), 20)
        total = 0
        for _ in range(n):
            amt = rng.uniform(100, 900)
            total += amt
            tx(c, start + timedelta(days=rng.randint(0, days)), "in", amt, new_cp(), "Denmark", "app", tag)
        tx(c, start + timedelta(days=days + 2), "out", total * rng.uniform(0.6, 0.9), own, "Denmark", "bank_transfer", tag)
    elif pattern == "dormant_spike":
        target = c["expected_monthly_volume_eur"] * (rng.uniform(2.5, 3.5) if weak else rng.uniform(8, 15))
        ins = rng.randint(1, 3)
        for _ in range(ins):
            tx(c, start + timedelta(days=rng.randint(0, 4)), "in", target / 2 / ins, new_cp(), "Denmark", "bank_transfer", tag)
        outs = rng.randint(2, 3)
        for _ in range(outs):
            tx(c, start + timedelta(days=rng.randint(5, 10)), "out", target / 2 / outs * rng.uniform(0.9, 1.0), new_cp(),
               rng.choice(["Denmark"] + BY_TIER["low"] + BY_TIER["medium"]), "bank_transfer", tag)
    elif pattern == "high_risk_corridor":
        n = rng.randint(1, 2) if weak else rng.randint(3, 5)
        recips = [new_cp() for _ in range(2)]
        country = rng.choice(BY_TIER["high"])
        for _ in range(n):
            day = start + timedelta(days=rng.randint(0, 25))
            amt = rng.uniform(600, 1200) if weak else rng.uniform(1500, 6000)
            tx(c, day - timedelta(days=1), "in", amt, own, "Denmark", "bank_transfer", tag)
            tx(c, day, "out", amt * rng.uniform(0.95, 1.0), rng.choice(recips), country, "app", tag)
    elif pattern == "purpose_mismatch":
        n = rng.randint(9, 11) if weak else rng.randint(20, 35)
        for _ in range(n):
            d = "in" if rng.random() < 0.55 else "out"
            tx(c, start + timedelta(days=rng.randint(0, 27)), d, rng.uniform(100, 3000), new_cp(),
               rng.choice(["Denmark"] * 4 + BY_TIER["low"]), rng.choice(["app", "bank_transfer"]), tag)


def choose_planted(customers, origins):
    """Stratified by name-origin group so the planted set has the same mix as everyone else."""
    by_group = {g: [c for c in customers if origins[c["customer_id"]] == g] for g in GROUP_WEIGHTS}
    shares = {g: len(v) / len(customers) * N_PLANTED for g, v in by_group.items()}
    quota = {g: int(s) for g, s in shares.items()}
    for g in sorted(shares, key=lambda g: shares[g] - quota[g], reverse=True)[:N_PLANTED - sum(quota.values())]:
        quota[g] += 1  # largest remainder
    chosen = [c for g, q in quota.items() for c in rng.sample(by_group[g], q)]
    rng.shuffle(chosen)
    return chosen


def compatible(c, pattern):
    if pattern == "purpose_mismatch":
        return c["declared_purpose"] in ("savings", "family_support")
    if pattern in ("pass_through", "fan_in"):
        return c["customer_type"] == "private"
    return True


def assign_patterns(planted):
    quota = {p: N_PLANTED // len(PATTERNS) for p in PATTERNS}
    rows = []
    for c in sorted(planted, key=lambda c: c["customer_type"] != "small_business"):  # businesses first: fewer options
        options = [p for p in PATTERNS if quota[p] > 0 and compatible(c, p)] or [p for p in PATTERNS if compatible(c, p)]
        p = max(options, key=lambda p: (quota[p], rng.random()))
        quota[p] -= 1
        rows.append({"customer": c, "patterns": [p]})
    for r in rng.sample(rows, 6):  # six customers show a second pattern
        extra = [p for p in PATTERNS if p not in r["patterns"] and compatible(r["customer"], p) and p != "dormant_spike"]
        if "dormant_spike" not in r["patterns"]:
            r["patterns"].append(rng.choice(extra))
    weak_ids = {id(r) for r in rng.sample(rows, 6)}  # six customers show only a weak version
    for r in rows:
        r["strength"] = "weak" if id(r) in weak_ids else "full"
        r["start"] = rand_day(date(2026, 6, 1) if "dormant_spike" in r["patterns"] else START, date(2026, 9, 5))
    return rows


# ------------------------------------------------------------------ balances
def enforce_balances(customers):
    """Walk each account in time order; an outgoing transfer larger than the balance is cut to the balance
    (or dropped if under EUR 10). Returns the number of changed transfers."""
    opening = {c["customer_id"]: c["opening_balance_eur"] for c in customers}
    TX.sort(key=lambda t: (t[0], t[1], t[2] != "in"))
    bal, keep, changed = dict(opening), [], 0
    for t in TX:
        cid, amt = t[0], t[3]
        if t[2] == "out" and amt > bal[cid]:
            changed += 1
            if bal[cid] < 10:
                continue
            t[3] = amt = eur(bal[cid])
        bal[cid] = round(bal[cid] + (amt if t[2] == "in" else -amt), 2)
        keep.append(t)
    TX[:] = keep
    return changed


# ------------------------------------------------------------------ fairness check
def fairness_check(customers, origins, planted_ids, tolerance_pp=5.0):
    """Name-origin mix of the planted customers vs all customers. PASS if no group differs by more than 5 points."""
    def mix(ids):
        return {g: round(100 * sum(origins[i] == g for i in ids) / len(ids), 1) for g in GROUP_WEIGHTS}
    everyone, planted = mix([c["customer_id"] for c in customers]), mix(planted_ids)
    diff = {g: round(planted[g] - everyone[g], 1) for g in GROUP_WEIGHTS}
    return {"all_customers_pct": everyone, "planted_pct": planted, "difference_pp": diff,
            "tolerance_pp": tolerance_pp, "passed": all(abs(d) <= tolerance_pp for d in diff.values()),
            "method": "planted customers drawn by stratified sampling over name-origin group; "
                      "rules and AI never see the group"}


# ------------------------------------------------------------------ main
def write_csv(path, rows, cols):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    customers, origins = make_customers()
    planted = assign_patterns(choose_planted(customers, origins))
    for r in planted:  # a dormant-spike customer is quiet from the start of the history
        if "dormant_spike" in r["patterns"]:
            r["customer"]["_low_activity"] = True
    for c in customers:
        (normal_business if c["customer_type"] == "small_business" else normal_private)(c)
    for r in planted:
        for k, p in enumerate(r["patterns"]):
            plant(r["customer"], p, r["strength"] if k == 0 else "full", r["start"] + timedelta(days=k * rng.randint(0, 10)))
    changed = enforce_balances(customers)

    TX.sort(key=lambda t: (t[1], t[0]))
    tx_rows = [{"transaction_id": f"T{i:06d}", "timestamp": t[1].isoformat(sep=" ", timespec="minutes"),
                "customer_id": t[0], "direction": t[2], "amount_eur": f"{t[3]:.2f}", "counterparty_id": t[4],
                "counterparty_country": t[5], "channel": t[6]} for i, t in enumerate(TX, 1)]

    raw = ROOT / "data" / "raw"
    write_csv(raw / "customers.csv", customers, ["customer_id", "name", "customer_type", "onboarding_date", "declared_purpose",
                                                 "expected_monthly_volume_eur", "home_country", "kyc_risk_rating", "opening_balance_eur"])
    write_csv(raw / "transactions.csv", tx_rows, list(tx_rows[0]))
    write_csv(ROOT / "data" / "fairness" / "name_origin.csv",
              [{"customer_id": k, "name_origin_group": v} for k, v in origins.items()], ["customer_id", "name_origin_group"])
    write_csv(ROOT / "data" / "truth" / "planted.csv",
              [{"customer_id": r["customer"]["customer_id"], "patterns": "+".join(r["patterns"]), "primary_pattern": r["patterns"][0],
                "strength": r["strength"], "start_date": r["start"].isoformat()} for r in sorted(planted, key=lambda r: r["customer"]["customer_id"])],
              ["customer_id", "patterns", "primary_pattern", "strength", "start_date"])

    fair = fairness_check(customers, origins, [r["customer"]["customer_id"] for r in planted])
    checks = ROOT / "data" / "checks"
    checks.mkdir(parents=True, exist_ok=True)
    (checks / "fairness.json").write_text(json.dumps(fair, indent=2) + "\n", encoding="utf-8")
    in_window = sum(t[1].date() >= START for t in TX)
    report = {"customers": len(customers), "transactions": len(tx_rows), "transactions_apr_sep": in_window,
              "transactions_jan_mar_history": len(tx_rows) - in_window, "planted_customers": len(planted),
              "outgoing_transfers_cut_to_balance": changed}
    (checks / "generate_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    print(f"Fairness check (name-origin mix, planted vs all): {'PASS' if fair['passed'] else 'FAIL'}")
    for g in GROUP_WEIGHTS:
        print(f"  {g}: all {fair['all_customers_pct'][g]:5.1f} %  planted {fair['planted_pct'][g]:5.1f} %  diff {fair['difference_pp'][g]:+.1f} pp")


if __name__ == "__main__":
    main()
