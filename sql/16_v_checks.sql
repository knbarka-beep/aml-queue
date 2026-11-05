-- Consistency checks on the rule layer. build_db.py stops if any check has failures.
CREATE OR REPLACE VIEW v_checks AS
SELECT 1 AS check_no, 'No case transaction is dated after its case date' AS check_name,
       (SELECT count(*) FROM v_case_transactions) AS checked,
       (SELECT count(*) FROM v_case_transactions t JOIN v_cases c USING (case_id) WHERE t.tx_date > c.case_date) AS failures
UNION ALL
SELECT 2, 'Every case has at least one triggering transaction', (SELECT count(*) FROM v_cases),
       (SELECT count(*) FROM v_cases WHERE n_transactions IS NULL OR n_transactions = 0)
UNION ALL
SELECT 3, 'Case transactions belong to the case customer', (SELECT count(*) FROM v_case_transactions),
       (SELECT count(*) FROM v_case_transactions t JOIN v_cases c USING (case_id) WHERE t.customer_id <> c.customer_id)
UNION ALL
SELECT 4, 'Every alert is in exactly one case', (SELECT count(*) FROM v_alerts),
       (SELECT count(*) FROM v_alerts) - (SELECT count(DISTINCT alert_id) FROM v_alert_case)
UNION ALL
SELECT 5, 'All case dates in Apr-Sep 2026', (SELECT count(*) FROM v_cases),
       (SELECT count(*) FROM v_cases CROSS JOIN params WHERE case_date NOT BETWEEN period_start AND period_end)
UNION ALL
SELECT 6, 'Risk score between 0 and 100', (SELECT count(*) FROM v_cases),
       (SELECT count(*) FROM v_cases WHERE risk_score NOT BETWEEN 0 AND 100)
UNION ALL
SELECT 7, 'Cases on one customer are more than the grouping window apart', (SELECT count(*) FROM v_cases),
       (SELECT count(*) FROM v_alert_case a JOIN v_alert_case b ON a.customer_id = b.customer_id AND a.case_id < b.case_id
        CROSS JOIN params WHERE abs(b.alert_date - a.alert_date) <= case_grouping_days)
UNION ALL
SELECT 8, 'Monthly case counts add up to all cases', (SELECT count(*) FROM v_cases),
       abs((SELECT count(*) FROM v_cases) - (SELECT sum(cases_in_month) FROM v_monthly_kpis));
