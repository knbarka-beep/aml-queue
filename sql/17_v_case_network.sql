-- Counterparty network for each case, for the drill-down. One row per edge (one direction between two nodes).
--   * The case customer and every counterparty they transacted with in the 90 days up to and including the case date.
--   * For those counterparties: any OTHER customer who transacted with the same counterparty in the same window.
-- direction 'in' = counterparty paid the customer, 'out' = customer paid the counterparty.
-- Cap (display choice, not a rule threshold): the 25 counterparties with the largest total amount (in + out) with the
-- case customer keep their own node; the rest are grouped into one node 'OTHERS' ("+N others").
-- Nothing after the case date. Reads only v_cases and v_tx (raw data), never the answer key.
CREATE OR REPLACE VIEW v_case_network AS
WITH k AS (
    SELECT case_id, customer_id AS case_customer_id, case_date, case_date - 90 AS window_start FROM v_cases
), tx AS (
    -- the case customer's own transfers, and other customers' transfers with the same counterparties
    SELECT k.case_id, k.case_customer_id, t.*
    FROM k JOIN v_tx t ON t.customer_id = k.case_customer_id AND t.tx_date BETWEEN k.window_start AND k.case_date
    UNION ALL
    SELECT k.case_id, k.case_customer_id, t.*
    FROM k
    JOIN (SELECT DISTINCT k2.case_id, t2.counterparty_id
          FROM k k2 JOIN v_tx t2 ON t2.customer_id = k2.case_customer_id
                                AND t2.tx_date BETWEEN k2.window_start AND k2.case_date) cp USING (case_id)
    JOIN v_tx t ON t.counterparty_id = cp.counterparty_id AND t.customer_id <> k.case_customer_id
               AND t.tx_date BETWEEN k.window_start AND k.case_date
), ranked AS (
    SELECT case_id, counterparty_id,
           row_number() OVER (PARTITION BY case_id ORDER BY sum(amount_eur) DESC, counterparty_id) AS cp_rank
    FROM tx WHERE customer_id = case_customer_id
    GROUP BY case_id, counterparty_id
)
, capped AS (
    SELECT tx.*, CASE WHEN r.cp_rank <= 25 THEN tx.counterparty_id ELSE 'OTHERS' END AS node_id
    FROM tx JOIN ranked r USING (case_id, counterparty_id)
)
SELECT case_id,
       customer_id,
       customer_id = case_customer_id AS is_case_customer,
       node_id,
       CASE WHEN node_id <> 'OTHERS' THEN any_value(counterparty_country) END AS counterparty_country,
       CASE WHEN node_id <> 'OTHERS' THEN any_value(country_tier) END AS country_tier,
       count(DISTINCT counterparty_id) AS counterparties,
       direction,
       count(*) AS n_transfers,
       round(sum(amount_eur), 2) AS amount_eur,
       min(tx_date) AS first_tx_date,
       max(tx_date) AS last_tx_date
FROM capped
GROUP BY case_id, customer_id, case_customer_id, node_id, direction;
