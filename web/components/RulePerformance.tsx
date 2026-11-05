"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { meta, rulePerformance } from "@/lib/data";
import { num, pct } from "@/lib/format";

/** Second view: how many cases each rule raises, how many were truly suspicious, and how the AI suggestions compare. */
export default function RulePerformance() {
  const s = meta.scores;
  const data = rulePerformance.map((r) => ({
    rule: `${r.rule_id} ${r.name}`,
    suspicious: r.true_positive_cases ?? 0,
    falsePositive: r.cases - (r.true_positive_cases ?? 0),
  }));
  const ai = s?.ai;
  const byRule = Object.fromEntries((s?.rules ?? []).map((r) => [r.rule_id, r]));
  // The trade-off if an analyst reviewed only the cases the AI suggests escalating (from the 2x2 table).
  const t = ai?.table;
  const reviewed = t ? t.suspicious_escalate + t.not_suspicious_escalate : 0;
  const suspicious = t ? t.suspicious_escalate + t.suspicious_close : 0;
  return (
    <div className="grid2">
      <div className="card stack">
        <h2>Cases per rule, Apr-Sep 2026</h2>
        <p className="small muted">
          Most cases are false positives: ordinary behaviour that looks unusual (a car purchase, a seasonal business, family
          support to a high-risk-tier country). That is normal for rule-based monitoring, and it is why the analyst queue exists.
          {s && ` Overall, ${s.overall.true_positive_cases} of ${s.overall.cases} cases (${pct(s.overall.precision_pct)}) were truly suspicious.`}
        </p>
        <div style={{ width: "100%", height: 280 }} role="img"
          aria-label="Bar chart of cases per rule, split into truly suspicious and false positive. The same numbers are in the table below.">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" />
              <YAxis type="category" dataKey="rule" width={150} tick={{ fill: "var(--text)", fontSize: 12 }} stroke="var(--border)" />
              <Tooltip cursor={{ fill: "var(--neutral-soft)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="suspicious" name="Truly suspicious" stackId="a" fill="var(--accent)" isAnimationActive={false} />
              <Bar dataKey="falsePositive" name="False positive" stackId="a" fill="var(--dot)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Rule</th><th className="num">Cases</th><th className="num">Customers (planted)</th><th className="num">Truly suspicious</th><th className="num">Precision</th><th className="num">Pattern caught</th></tr></thead>
            <tbody>
              {rulePerformance.map((r) => (
                <tr key={r.rule_id}>
                  <td>{r.rule_id} {r.name}</td>
                  <td className="num">{r.cases}</td>
                  <td className="num">{byRule[r.rule_id] ? `${byRule[r.rule_id].customers} (${byRule[r.rule_id].planted_customers})` : "n/a"}</td>
                  <td className="num">{r.true_positive_cases ?? "n/a"}</td>
                  <td className="num">{pct(r.precision_pct)}</td>
                  <td className="num">{r.caught_customers_with_pattern ?? "n/a"} of {r.planted_customers_with_pattern ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">A case can hit several rules, so the rule rows add up to more than the number of cases. Precision counts cases; one customer can have several cases from the same rule, so the customers column shows how many different customers that is, and how many of them were planted. Precision and recall are measured against the answer key of the synthetic data.</p>
      </div>

      <div className="card stack">
        <h2>AI suggestion vs what was planted</h2>
        {ai ? (
          <>
            <div className="tablewrap">
              <table className="t22">
                <thead><tr><th></th><th>AI: escalate</th><th>AI: close</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Truly suspicious</th><td className="big">{ai.table.suspicious_escalate}</td><td className="big">{ai.table.suspicious_close}</td></tr>
                  <tr><th scope="row">Not suspicious</th><td className="big">{ai.table.not_suspicious_escalate}</td><td className="big">{ai.table.not_suspicious_close}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="decide" id="trade-off">If an analyst reviewed only the cases the AI suggests escalating: {reviewed} of {s!.overall.cases} cases
              reviewed, {t!.suspicious_escalate} of {suspicious} truly suspicious cases found, {t!.suspicious_close} missed.
              In AML a missed case costs more than a false positive, so the AI is used to order the queue, not to close cases.</p>
            <p><strong>{pct(ai.escalation_rate_on_suspicious_pct)}</strong> of truly suspicious cases suggested for escalation.
              A missed escalation is the costly error: the analyst could close a real case.</p>
            <p><strong>{pct(ai.close_rate_on_false_positives_pct)}</strong> of false positives suggested for closing.
              This only saves time if the analyst agrees; no time saving is measured here.</p>
            <p className="small muted">
              Automatic checks (every number matches the case data, no later dates, required fields, length, wording):
              {" "}{ai.number_check_first_attempt_passed} of {ai.drafts} drafts passed on the first attempt,
              {" "}{ai.number_check_final_passed} of {ai.drafts} after up to two retries (average {num(ai.average_attempts, 2)} attempts).
              {ai.cases_without_draft > 0 && ` ${ai.cases_without_draft} cases have no usable draft.`}
            </p>
          </>
        ) : <p className="muted">No AI drafts yet: the AI step was skipped (no API key) or has not run.</p>}
        {meta.ai_run?.spend_usd != null && <p className="small muted">AI spend for all drafts: USD {num(meta.ai_run.spend_usd, 2)} ({meta.ai_run.model}).</p>}
      </div>
    </div>
  );
}
