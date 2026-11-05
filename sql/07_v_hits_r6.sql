-- R6 Purpose mismatch: a private customer who declared one of the listed purposes (savings, family support) and has
-- at least min_counterparties different counterparties (in and out) in the last window_days.
CREATE OR REPLACE VIEW v_hits_r6 AS
WITH p AS (SELECT * FROM params),
el AS (SELECT t.* FROM v_tx t CROSS JOIN p
       WHERE t.customer_type = 'private' AND list_contains(string_split(p.r6_purposes, ','), t.declared_purpose))
SELECT 'R6' AS rule_id, a.customer_id, a.ts AS anchor_ts,
       list(b.transaction_id ORDER BY b.ts) AS tx_ids, count(*) AS n_tx, sum(b.amount_eur) AS amount_eur,
       CAST(count(DISTINCT b.counterparty_id) AS DOUBLE) AS metric, NULL::DOUBLE AS metric2
FROM el a CROSS JOIN p
JOIN el b ON b.customer_id = a.customer_id AND b.ts > a.ts - to_days(p.r6_window_days) AND b.ts <= a.ts
GROUP BY a.customer_id, a.ts, p.r6_min_counterparties
HAVING count(DISTINCT b.counterparty_id) >= p.r6_min_counterparties;
