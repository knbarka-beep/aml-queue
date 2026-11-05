-- R1 Structuring: at least min_count transfers (in or out) from band_low_pct % of the threshold up to (not
-- including) the threshold, within window_days. Evaluated at each such transfer (the anchor), looking back.
CREATE OR REPLACE VIEW v_hits_r1 AS
WITH p AS (SELECT * FROM params),
rel AS (SELECT t.* FROM v_tx t, p
        WHERE t.amount_eur >= p.r1_threshold_eur * p.r1_band_low_pct / 100 AND t.amount_eur < p.r1_threshold_eur)
SELECT 'R1' AS rule_id, a.customer_id, a.ts AS anchor_ts,
       list(b.transaction_id ORDER BY b.ts) AS tx_ids, count(*) AS n_tx, sum(b.amount_eur) AS amount_eur,
       CAST(count(*) AS DOUBLE) AS metric, NULL::DOUBLE AS metric2
FROM rel a CROSS JOIN p
JOIN rel b ON b.customer_id = a.customer_id AND b.ts > a.ts - to_days(p.r1_window_days) AND b.ts <= a.ts
GROUP BY a.customer_id, a.ts, p.r1_min_count
HAVING count(*) >= p.r1_min_count;
