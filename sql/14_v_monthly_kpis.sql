-- Per month: cases dated in the month, cases dated in the month before, and the open backlog at month end.
-- No analyst decisions exist in this demo, so every case is still open ("Awaiting analyst").
CREATE OR REPLACE VIEW v_monthly_kpis AS
WITH months AS (SELECT strftime(m, '%Y-%m') AS month
                FROM range(TIMESTAMP '2026-04-01', TIMESTAMP '2026-10-01', INTERVAL 1 MONTH) r(m)),
per AS (SELECT case_month AS month, count(*) AS cases FROM v_cases GROUP BY 1),
al AS (SELECT strftime(alert_date, '%Y-%m') AS month, count(*) AS alerts FROM v_alerts GROUP BY 1),
base AS (SELECT m.month, coalesce(p.cases, 0) AS cases_in_month, coalesce(al.alerts, 0) AS alerts_in_month
         FROM months m LEFT JOIN per p USING (month) LEFT JOIN al USING (month))
SELECT month, cases_in_month,
       coalesce(lag(cases_in_month) OVER (ORDER BY month), 0) AS cases_prev_month,
       sum(cases_in_month) OVER (ORDER BY month) AS open_cases_month_end,
       alerts_in_month
FROM base
ORDER BY month;
