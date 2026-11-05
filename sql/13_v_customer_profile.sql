-- Customer profile for customers with at least one case. No name and no name origin: the analyst view and the AI
-- work from the customer id, profile and behaviour only.
CREATE OR REPLACE VIEW v_customer_profile AS
SELECT c.customer_id, c.customer_type, c.onboarding_date, c.declared_purpose, c.expected_monthly_volume_eur,
       c.home_country, coalesce(k.tier, 'unknown') AS home_country_tier, c.kyc_risk_rating,
       (SELECT count(*) FROM v_cases x WHERE x.customer_id = c.customer_id) AS n_cases
FROM customers c LEFT JOIN countries k ON k.country = c.home_country
WHERE c.customer_id IN (SELECT customer_id FROM v_cases);
