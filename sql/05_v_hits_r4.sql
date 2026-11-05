-- R4 Volume spike: at any transfer, volume (in + out) in the last window_days compared with the larger of
-- the declared expected monthly volume and the customer's own average monthly volume in the baseline_days before.
-- metric = volume / that larger figure; metric2 = the larger figure (the baseline used).
CREATE OR REPLACE VIEW v_hits_r4 AS
WITH p AS (SELECT * FROM params),
agg AS (
  SELECT a.customer_id, a.ts AS anchor_ts, any_value(a.expected_monthly_volume_eur) AS expected,
         sum(b.amount_eur) FILTER (b.ts > a.ts - to_days(p.r4_window_days)) AS volume,
         coalesce(sum(b.amount_eur) FILTER (b.ts <= a.ts - to_days(p.r4_window_days)), 0)
           / (p.r4_baseline_days / 30.0) AS baseline_monthly,
         list(b.transaction_id ORDER BY b.ts) FILTER (b.ts > a.ts - to_days(p.r4_window_days)) AS tx_ids,
         count(*) FILTER (b.ts > a.ts - to_days(p.r4_window_days)) AS n_tx
  FROM v_tx a CROSS JOIN p
  JOIN v_tx b ON b.customer_id = a.customer_id
             AND b.ts > a.ts - to_days(p.r4_window_days + p.r4_baseline_days) AND b.ts <= a.ts
  WHERE a.tx_date >= p.period_start
  GROUP BY a.customer_id, a.ts, p.r4_window_days, p.r4_baseline_days)
SELECT 'R4' AS rule_id, customer_id, anchor_ts, tx_ids, n_tx, volume AS amount_eur,
       round(volume / greatest(expected, baseline_monthly), 1) AS metric,
       round(greatest(expected, baseline_monthly), 2) AS metric2
FROM agg CROSS JOIN p
WHERE volume >= p.r4_min_volume_eur AND volume >= p.r4_multiple * greatest(expected, baseline_monthly);
