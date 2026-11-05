-- Which case each alert belongs to: alerts on one customer within case_grouping_days of the previous alert share a case.
-- The case date is the date of its last alert; case ids are numbered by case date.
CREATE OR REPLACE VIEW v_alert_case AS
WITH p AS (SELECT * FROM params),
ordered AS (SELECT a.*, lag(alert_date) OVER (PARTITION BY customer_id ORDER BY alert_date, rule_id) AS prev_date FROM v_alerts a),
flagged AS (SELECT o.*, CASE WHEN o.prev_date IS NULL OR o.alert_date - o.prev_date > p.case_grouping_days THEN 1 ELSE 0 END AS new_case
            FROM ordered o CROSS JOIN p),
numbered AS (SELECT *, sum(new_case) OVER (PARTITION BY customer_id ORDER BY alert_date, rule_id) AS case_no FROM flagged),
cases AS (SELECT customer_id, case_no, max(alert_date) AS case_date FROM numbered GROUP BY ALL),
ids AS (SELECT *, 'CASE-' || lpad(CAST(row_number() OVER (ORDER BY case_date, customer_id) AS VARCHAR), 4, '0') AS case_id FROM cases)
SELECT i.case_id, n.alert_id, n.rule_id, n.customer_id, n.alert_date, i.case_date, n.tx_ids, n.n_tx, n.amount_eur, n.metric, n.metric2
FROM numbered n JOIN ids i USING (customer_id, case_no);
