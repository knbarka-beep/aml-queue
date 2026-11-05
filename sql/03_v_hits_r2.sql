-- R2 Pass-through: at an outgoing transfer, look back window_hours. Money in from at least min_senders different
-- senders, at least min_inflow_eur in total, and money out in the same window at least min_out_share_pct of it.
-- metric = money out as % of money in; metric2 = number of different senders.
CREATE OR REPLACE VIEW v_hits_r2 AS
WITH p AS (SELECT * FROM params),
w AS (SELECT o.customer_id, o.ts AS anchor_ts, b.transaction_id, b.ts, b.direction, b.amount_eur, b.counterparty_id
      FROM v_tx o CROSS JOIN p
      JOIN v_tx b ON b.customer_id = o.customer_id AND b.ts > o.ts - to_hours(p.r2_window_hours) AND b.ts <= o.ts
      WHERE o.direction = 'out'),
agg AS (SELECT customer_id, anchor_ts,
               sum(amount_eur) FILTER (direction = 'in') AS inflow,
               sum(amount_eur) FILTER (direction = 'out') AS outflow,
               count(DISTINCT counterparty_id) FILTER (direction = 'in') AS senders,
               list(transaction_id ORDER BY ts) AS tx_ids, count(*) AS n_tx, sum(amount_eur) AS amount_eur
        FROM w GROUP BY customer_id, anchor_ts)
SELECT 'R2' AS rule_id, customer_id, anchor_ts, tx_ids, n_tx, amount_eur,
       round(100 * outflow / inflow, 1) AS metric, CAST(senders AS DOUBLE) AS metric2
FROM agg CROSS JOIN p
WHERE senders >= p.r2_min_senders AND inflow >= p.r2_min_inflow_eur AND outflow >= inflow * p.r2_min_out_share_pct / 100;
