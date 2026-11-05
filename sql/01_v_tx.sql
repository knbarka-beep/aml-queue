-- Every transaction with the customer and country facts the rules need.
CREATE OR REPLACE VIEW v_tx AS
SELECT t.transaction_id, t.ts, CAST(t.ts AS DATE) AS tx_date, t.customer_id, t.direction, t.amount_eur,
       t.counterparty_id, t.counterparty_country, coalesce(k.tier, 'unknown') AS country_tier, t.channel,
       c.customer_type, c.declared_purpose, c.expected_monthly_volume_eur, c.kyc_risk_rating
FROM transactions t
JOIN customers c USING (customer_id)
LEFT JOIN countries k ON k.country = t.counterparty_country;
