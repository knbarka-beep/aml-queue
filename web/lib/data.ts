// Typed access to web/data/*.json, written by scripts/build_db.py. No API calls at runtime.
import casesRaw from "../data/cases.json";
import txRaw from "../data/transactions.json";
import caseTxRaw from "../data/case_transactions.json";
import customersRaw from "../data/customers.json";
import kpisRaw from "../data/monthly_kpis.json";
import perfRaw from "../data/rule_performance.json";
import metaRaw from "../data/meta.json";

export type Alert = { alert_id: string; rule_id: string; rule_name: string; alert_date: string; reason: string };
export type AiDraft = {
  summary: string; suggestion: "escalate" | "close as false positive"; reasons: string[]; missing: string[];
  check_passed: boolean; failed_checks: string[]; attempts: number; model: string; prompt_version: string;
};
export type Case = {
  case_id: string; customer_id: string; customer_type: string; declared_purpose: string; kyc_risk_rating: string;
  expected_monthly_volume_eur: number; first_alert_date: string; case_date: string; case_month: string;
  n_alerts: number; rules_hit: string[]; n_transactions: number; amount_involved_eur: number;
  rule_points: number; kyc_points: number; amount_points: number; risk_score: number; status: string;
  tx_90d: number; in_90d_eur: number; out_90d_eur: number; avg_monthly_volume_90d_eur: number;
  counterparties_90d: number; largest_tx_90d_eur: number; high_tier_tx_90d: number;
  alerts: Alert[]; ai: AiDraft | null;
};
export type Tx = {
  transaction_id: string; ts: string; customer_id: string; direction: "in" | "out"; amount_eur: number;
  counterparty_id: string; counterparty_country: string; country_tier: string; channel: string;
};
export type Customer = {
  customer_id: string; customer_type: string; onboarding_date: string; declared_purpose: string;
  expected_monthly_volume_eur: number; home_country: string; home_country_tier: string; kyc_risk_rating: string; n_cases: number;
};
export type MonthKpi = { month: string; cases_in_month: number; cases_prev_month: number; open_cases_month_end: number; alerts_in_month: number };
export type RulePerf = {
  rule_id: string; name: string; weight: number; alerts: number; cases: number; true_positive_cases: number | null;
  precision_pct: number | null; planted_customers_with_pattern: number | null; caught_customers_with_pattern: number | null; recall_pct: number | null;
};
export type Scores = {
  overall: { cases: number; true_positive_cases: number; false_positive_cases: number; precision_pct: number;
    planted_customers: number; planted_customers_caught: number; recall_pct: number; cases_on_planted_customers_before_pattern_start: number };
  recall_by_primary_pattern: Record<string, { planted: number; caught: number }>;
  recall_by_strength: Record<string, { planted: number; caught: number }>;
  ai?: { drafts: number; cases_without_draft: number;
    table: { suspicious_escalate: number; suspicious_close: number; not_suspicious_escalate: number; not_suspicious_close: number };
    escalation_rate_on_suspicious_pct: number; close_rate_on_false_positives_pct: number;
    number_check_first_attempt_passed: number; number_check_final_passed: number; average_attempts: number };
  fairness_by_name_origin_group: Record<string, { customers: number; share_of_customers_pct: number; customers_with_case_pct: number;
    share_of_cases_pct: number; ai_escalation_rate_pct: number | null }>;
} | null;
export type Meta = {
  company: string; notice: string; months: string[]; default_month: string;
  rules: Record<string, { name: string; weight: number; how: string }>;
  risk_score: { kyc_points: Record<string, number>; amount_points_max: number; amount_ratio_full: number };
  countries: Record<string, string>; case_count: number; alert_count: number; scores: Scores;
  fairness: { planted_mix_within_pp: number; passed: boolean; max_difference_pp: number };
  ai_run: { model: string; status: string; drafts?: number; api_calls?: number; spend_usd?: number; cap_usd: number;
    first_attempt_passed?: number; final_passed?: number; cases?: number } | null;
};

export const cases = casesRaw as unknown as Case[];
export const transactions = txRaw as unknown as Tx[];
export const caseTransactions = caseTxRaw as unknown as { case_id: string; transaction_id: string; rules: string }[];
export const customers = Object.fromEntries((customersRaw as unknown as Customer[]).map((c) => [c.customer_id, c]));
export const monthlyKpis = kpisRaw as unknown as MonthKpi[];
export const rulePerformance = perfRaw as unknown as RulePerf[];
export const meta = metaRaw as unknown as Meta;
