-- The transactions that triggered each case (distinct over the alerts in the case), and which rules they triggered.
CREATE OR REPLACE VIEW v_case_transactions AS
WITH x AS (SELECT case_id, rule_id, unnest(tx_ids) AS transaction_id FROM v_alert_case)
SELECT x.case_id, t.transaction_id, t.ts, t.tx_date, t.customer_id, t.direction, t.amount_eur, t.counterparty_id,
       t.counterparty_country, t.country_tier, t.channel, string_agg(DISTINCT x.rule_id, ',' ORDER BY x.rule_id) AS rules
FROM x JOIN v_tx t USING (transaction_id)
GROUP BY ALL;
