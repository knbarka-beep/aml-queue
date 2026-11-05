-- Per rule: alerts, cases with the rule, and (once evaluate.py has run) true positives and precision.
-- The true-positive counts come from eval_rule_scores, the aggregate written by evaluate.py; this layer never reads the answer key.
CREATE OR REPLACE VIEW v_rule_performance AS
SELECT i.rule_id, i.name, i.weight,
       (SELECT count(*) FROM v_alerts a WHERE a.rule_id = i.rule_id) AS alerts,
       (SELECT count(*) FROM v_cases c WHERE list_contains(c.rules_hit, i.rule_id)) AS cases,
       e.true_positive_cases, e.precision_pct, e.planted_customers_with_pattern, e.caught_customers_with_pattern, e.recall_pct
FROM rule_info i LEFT JOIN eval_rule_scores e USING (rule_id)
ORDER BY i.rule_id;
