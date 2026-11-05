-- Normal activity in the 90 days before each case's first alert (the days before anything was flagged).
-- Used for the AI input and the drill-down. Nothing after the case date.
CREATE OR REPLACE VIEW v_case_baseline AS
SELECT k.case_id,
       count(t.transaction_id) AS tx_90d,
       coalesce(sum(t.amount_eur) FILTER (t.direction = 'in'), 0) AS in_90d_eur,
       coalesce(sum(t.amount_eur) FILTER (t.direction = 'out'), 0) AS out_90d_eur,
       round(coalesce(sum(t.amount_eur), 0) / 3, 2) AS avg_monthly_volume_90d_eur,
       count(DISTINCT t.counterparty_id) AS counterparties_90d,
       coalesce(max(t.amount_eur), 0) AS largest_tx_90d_eur,
       count(t.transaction_id) FILTER (t.country_tier = 'high') AS high_tier_tx_90d
FROM v_cases k
LEFT JOIN v_tx t ON t.customer_id = k.customer_id
                AND t.tx_date >= k.first_alert_date - 90 AND t.tx_date < k.first_alert_date
GROUP BY k.case_id;
