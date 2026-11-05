-- R3 Fan-in: at an incoming transfer, the number of different senders in the last window_days.
-- Private customers: at least min_senders_private; small businesses: at least min_senders_business.
CREATE OR REPLACE VIEW v_hits_r3 AS
WITH p AS (SELECT * FROM params),
ins AS (SELECT * FROM v_tx WHERE direction = 'in')
SELECT 'R3' AS rule_id, a.customer_id, a.ts AS anchor_ts,
       list(b.transaction_id ORDER BY b.ts) AS tx_ids, count(*) AS n_tx, sum(b.amount_eur) AS amount_eur,
       CAST(count(DISTINCT b.counterparty_id) AS DOUBLE) AS metric, NULL::DOUBLE AS metric2
FROM ins a CROSS JOIN p
JOIN ins b ON b.customer_id = a.customer_id AND b.ts > a.ts - to_days(p.r3_window_days) AND b.ts <= a.ts
GROUP BY a.customer_id, a.ts, a.customer_type, p.r3_min_senders_private, p.r3_min_senders_business
HAVING count(DISTINCT b.counterparty_id) >= CASE WHEN a.customer_type = 'private'
                                                 THEN p.r3_min_senders_private ELSE p.r3_min_senders_business END;
