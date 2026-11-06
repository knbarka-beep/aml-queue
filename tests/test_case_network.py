"""Checks the counterparty network view (sql/17_v_case_network.sql). Run after build_db.py.

  1. No look-ahead: every edge lies in the 90 days up to and including its case date.
  2. Complete: per case and direction, the edges add up to the case customer's own transfers in that window.
  3. Cap: at most 25 counterparty nodes per case plus one "OTHERS" node.
  4. No answer key: the SQL file and the exported JSON never refer to data/truth or planted customers.
Run:  python tests/test_case_network.py   (or with pytest)
"""
import json
import re
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "sql" / "17_v_case_network.sql"


def con():
    return duckdb.connect(str(ROOT / "data" / "aml.duckdb"), read_only=True)


def test_no_data_after_case_date():
    bad = con().execute("""
        SELECT count(*) FROM v_case_network n JOIN v_cases c USING (case_id)
        WHERE n.last_tx_date > c.case_date OR n.first_tx_date < c.case_date - 90""").fetchone()[0]
    assert bad == 0, f"{bad} network edges fall outside the 90 days up to the case date"


def test_edges_add_up_to_own_transfers():
    diff = con().execute("""
        WITH own AS (SELECT c.case_id, t.direction, count(*) AS n, round(sum(t.amount_eur), 2) AS amt
                     FROM v_cases c JOIN v_tx t ON t.customer_id = c.customer_id
                                               AND t.tx_date BETWEEN c.case_date - 90 AND c.case_date
                     GROUP BY ALL),
             net AS (SELECT case_id, direction, sum(n_transfers) AS n, round(sum(amount_eur), 2) AS amt
                     FROM v_case_network WHERE is_case_customer GROUP BY ALL)
        SELECT count(*) FROM own FULL JOIN net USING (case_id, direction)
        WHERE own.n IS DISTINCT FROM net.n OR abs(own.amt - net.amt) > 0.05""").fetchone()[0]
    assert diff == 0, f"{diff} case/direction pairs do not add up"


def test_cap():
    worst = con().execute("""
        SELECT max(n) FROM (SELECT case_id, count(DISTINCT node_id) FILTER (node_id <> 'OTHERS') AS n
                            FROM v_case_network GROUP BY 1)""").fetchone()[0]
    assert worst <= 25, f"a case has {worst} counterparty nodes"


def test_no_answer_key():
    pattern = r"data/truth|planted|truth"
    assert not re.search(pattern, SQL.read_text(encoding="utf-8").replace("never the answer key", "")), "SQL mentions the answer key"
    exported = (ROOT / "web" / "data" / "case_network.json").read_text(encoding="utf-8")
    keys = set().union(*(row.keys() for row in json.loads(exported)))
    assert not any(re.search(pattern, k) for k in keys), f"exported fields: {keys}"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
    print(f"All {len(tests)} network tests passed.")
