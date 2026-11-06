"use client";

import { meta, rulePerformance } from "@/lib/data";
import { num, pct } from "@/lib/format";
import { InfoTip } from "./kit/InfoTip";

/** Second view: the false-positive story. Precision per rule, the AI suggestion against the answer key (2x2),
 *  and the trade-off if an analyst reviewed only what the AI suggests escalating. Every number comes from the files. */
export default function RulePerformance() {
  const s = meta.scores;
  const ai = s?.ai;
  const byRule = Object.fromEntries((s?.rules ?? []).map((r) => [r.rule_id, r]));
  const maxCases = Math.max(...rulePerformance.map((r) => r.cases));
  // The trade-off if an analyst reviewed only the cases the AI suggests escalating (from the 2x2 table).
  const t = ai?.table;
  const reviewed = t ? t.suspicious_escalate + t.not_suspicious_escalate : 0;
  const suspicious = t ? t.suspicious_escalate + t.suspicious_close : 0;
  return (
    <div className="grid2">
      <div className="card stack" style={{ gap: 14 }}>
        <div className="network-title">
          <h2>Precision per rule, Apr-Sep 2026</h2>
          <InfoTip label="precision per rule">
            <p>Most cases are false positives: ordinary behaviour that looks unusual (a car purchase, a seasonal business, family
              support to a high-risk-tier country). That is normal for rule-based monitoring, and it is why the analyst queue exists.</p>
            <p>Precision and recall are measured against the answer key of the synthetic data. A case can hit several rules, so the
              rule rows add up to more than the number of cases.</p>
          </InfoTip>
        </div>
        {s && <p className="stat">{s.overall.true_positive_cases} of {s.overall.cases} cases ({pct(s.overall.precision_pct)}) were truly suspicious.</p>}
        <div className="keys" aria-hidden="true"><span><i style={{ background: "var(--accent)" }} />Truly suspicious</span><span><i style={{ background: "var(--border-strong)" }} />False positive</span></div>
        <div className="rulebars" role="img" aria-label="Cases per rule, split into truly suspicious and false positive, with the precision of each rule. The same numbers are in the table below.">
          {rulePerformance.map((r) => {
            const tp = r.true_positive_cases ?? 0;
            return (
              <div key={r.rule_id} className="rulebar">
                <span><b>{r.rule_id}</b> {r.name}</span>
                <div className="track" style={{ width: `${(r.cases / maxCases) * 100}%` }}>
                  <span className="tp" style={{ flex: tp }} />
                  <span className="fp" style={{ flex: r.cases - tp }} />
                  <span className="n">{r.cases}</span>
                </div>
                <span className="prec">{pct(r.precision_pct, 0)}</span>
              </div>
            );
          })}
        </div>
        <div className="tablewrap">
          <table className="wrap-head">
            <thead><tr><th>Rule</th><th className="num">Cases</th><th className="num">Customers (planted)</th><th className="num">Truly suspicious</th><th className="num">Precision</th><th className="num">Pattern caught</th></tr></thead>
            <tbody>
              {rulePerformance.map((r) => (
                <tr key={r.rule_id}>
                  <td className="nowrap">{r.rule_id} {r.name}</td>
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
        <p className="small muted">One customer can have several cases from the same rule; the customers column shows how many different customers that is, and how many of them were planted.</p>
      </div>

      <div className="card stack" style={{ gap: 14 }}>
        <h2>AI suggestion vs what was planted</h2>
        {ai && t ? (
          <>
            <div className="tablewrap">
              <table className="t22">
                <thead><tr><th></th><th>AI: escalate</th><th>AI: close</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Truly suspicious</th>
                    <td className="right"><span className="big">{t.suspicious_escalate}</span><span className="lab">found</span></td>
                    <td><span className="big">{t.suspicious_close}</span><span className="lab">missed, the costly error</span></td></tr>
                  <tr><th scope="row">Not suspicious</th>
                    <td><span className="big">{t.not_suspicious_escalate}</span><span className="lab">extra reviews</span></td>
                    <td className="right"><span className="big">{t.not_suspicious_close}</span><span className="lab">correctly closed</span></td></tr>
                </tbody>
              </table>
            </div>
            <div className="tradeoff">
              <div className="line">
                <div><span>Cases reviewed</span><span className="stat">{reviewed} of {s!.overall.cases}</span></div>
                <div className="bar" role="img" aria-label={`${reviewed} of ${s!.overall.cases} cases reviewed`}><span style={{ width: `${(reviewed / s!.overall.cases) * 100}%` }} /></div>
              </div>
              <div className="line">
                <div><span>Truly suspicious cases found</span><span className="stat">{t.suspicious_escalate} of {suspicious}</span></div>
                <div className="bar found" role="img" aria-label={`${t.suspicious_escalate} of ${suspicious} truly suspicious cases found`}><span style={{ width: `${(t.suspicious_escalate / suspicious) * 100}%` }} /></div>
              </div>
              <p id="trade-off">If an analyst reviewed only the cases the AI suggests escalating: {reviewed} of {s!.overall.cases} cases
                reviewed, {t.suspicious_escalate} of {suspicious} truly suspicious cases found, {t.suspicious_close} missed.
                In AML a missed case costs more than a false positive, so the AI is used to order the queue, not to close cases.</p>
            </div>
            <p><strong>{pct(ai.escalation_rate_on_suspicious_pct)}</strong> of truly suspicious cases suggested for escalation.
              A missed escalation is the costly error: the analyst could close a real case.</p>
            <p><strong>{pct(ai.close_rate_on_false_positives_pct)}</strong> of false positives suggested for closing.
              This only saves time if the analyst agrees; no time saving is measured here.</p>
            <p className="small muted">
              Automatic checks (every number matches the case data, no later dates, required fields, length, wording):
              {" "}{ai.number_check_first_attempt_passed} of {ai.drafts} drafts passed on the first attempt,
              {" "}{ai.number_check_final_passed} of {ai.drafts} after up to two retries (average {num(ai.average_attempts, 2)} attempts).
              {ai.cases_without_draft > 0 && ` ${ai.cases_without_draft} cases have no usable draft.`}
              {meta.ai_run?.spend_usd != null && ` AI spend for all drafts: USD ${num(meta.ai_run.spend_usd, 2)} (${meta.ai_run.model}).`}
            </p>
          </>
        ) : <p className="muted">No AI drafts yet: the AI step was skipped (no API key) or has not run.</p>}
      </div>
    </div>
  );
}
