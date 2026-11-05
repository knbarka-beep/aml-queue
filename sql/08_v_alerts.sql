-- Alerts: the first hit of a rule on a customer, and again only after the rule has been quiet for cooldown_days.
-- Only hits dated in Apr-Sep 2026 count (Jan-Mar is baseline history). One hit per customer, rule and day (the earliest).
CREATE OR REPLACE VIEW v_alerts AS
WITH p AS (SELECT * FROM params),
hits AS (SELECT * FROM v_hits_r1 UNION ALL BY NAME SELECT * FROM v_hits_r2 UNION ALL BY NAME SELECT * FROM v_hits_r3
         UNION ALL BY NAME SELECT * FROM v_hits_r4 UNION ALL BY NAME SELECT * FROM v_hits_r5
         UNION ALL BY NAME SELECT * FROM v_hits_r6),
daily AS (SELECT h.*, CAST(h.anchor_ts AS DATE) AS alert_date FROM hits h CROSS JOIN p
          WHERE CAST(h.anchor_ts AS DATE) BETWEEN p.period_start AND p.period_end
          QUALIFY row_number() OVER (PARTITION BY h.customer_id, h.rule_id, CAST(h.anchor_ts AS DATE) ORDER BY h.anchor_ts) = 1),
gaps AS (SELECT *, lag(alert_date) OVER (PARTITION BY customer_id, rule_id ORDER BY alert_date) AS prev_hit FROM daily)
SELECT g.rule_id || '-' || g.customer_id || '-' || strftime(g.alert_date, '%Y%m%d') AS alert_id,
       g.rule_id, g.customer_id, g.alert_date, g.anchor_ts, g.tx_ids, g.n_tx, g.amount_eur, g.metric, g.metric2
FROM gaps g CROSS JOIN p
WHERE g.prev_hit IS NULL OR g.alert_date - g.prev_hit > p.cooldown_days;
