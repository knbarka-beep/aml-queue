-- R5 High-risk corridor: at an outgoing transfer to a high-tier country, the transfers to high-tier countries in the
-- last window_days: at least min_total_eur in total, or at least min_count transfers.
CREATE OR REPLACE VIEW v_hits_r5 AS
WITH p AS (SELECT * FROM params),
hr AS (SELECT * FROM v_tx WHERE direction = 'out' AND country_tier = 'high')
SELECT 'R5' AS rule_id, a.customer_id, a.ts AS anchor_ts,
       list(b.transaction_id ORDER BY b.ts) AS tx_ids, count(*) AS n_tx, sum(b.amount_eur) AS amount_eur,
       CAST(count(*) AS DOUBLE) AS metric, NULL::DOUBLE AS metric2
FROM hr a CROSS JOIN p
JOIN hr b ON b.customer_id = a.customer_id AND b.ts > a.ts - to_days(p.r5_window_days) AND b.ts <= a.ts
GROUP BY a.customer_id, a.ts, p.r5_min_total_eur, p.r5_min_count
HAVING sum(b.amount_eur) >= p.r5_min_total_eur OR count(*) >= p.r5_min_count;
