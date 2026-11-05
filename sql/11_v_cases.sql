-- One row per case. Risk score = min(100, rule points + KYC points + amount points):
--   rule points   = sum of the weights of the distinct rules hit,
--   KYC points    = by KYC risk rating,
--   amount points = amount_points_max x min(1, amount involved / (amount_ratio_full x expected monthly volume)).
CREATE OR REPLACE VIEW v_cases AS
WITH p AS (SELECT * FROM params),
rules AS (SELECT case_id, any_value(customer_id) AS customer_id, any_value(case_date) AS case_date,
                 min(alert_date) AS first_alert_date, count(*) AS n_alerts,
                 list(DISTINCT rule_id ORDER BY rule_id) AS rules_hit
          FROM v_alert_case GROUP BY case_id),
pts AS (SELECT r.case_id, sum(i.weight) AS rule_points
        FROM (SELECT DISTINCT case_id, rule_id FROM v_alert_case) r JOIN rule_info i USING (rule_id) GROUP BY r.case_id),
amt AS (SELECT case_id, count(*) AS n_transactions, sum(amount_eur) AS amount_involved_eur FROM v_case_transactions GROUP BY case_id),
scored AS (
  SELECT r.case_id, r.customer_id, c.customer_type, c.declared_purpose, c.kyc_risk_rating, c.expected_monthly_volume_eur,
         r.first_alert_date, r.case_date, strftime(r.case_date, '%Y-%m') AS case_month, r.n_alerts, r.rules_hit,
         a.n_transactions, round(a.amount_involved_eur, 2) AS amount_involved_eur,
         pts.rule_points,
         CASE c.kyc_risk_rating WHEN 'low' THEN p.kyc_points_low WHEN 'medium' THEN p.kyc_points_medium ELSE p.kyc_points_high END AS kyc_points,
         round(p.amount_points_max * least(1, a.amount_involved_eur / (p.amount_ratio_full * c.expected_monthly_volume_eur)), 1) AS amount_points
  FROM rules r JOIN customers c USING (customer_id) JOIN pts USING (case_id) JOIN amt a USING (case_id) CROSS JOIN p)
SELECT *, CAST(round(least(100, rule_points + kyc_points + amount_points)) AS INTEGER) AS risk_score,
       'Awaiting analyst' AS status
FROM scored;
