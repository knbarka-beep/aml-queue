import Link from "next/link";
import type { Metadata } from "next";
import { meta } from "@/lib/data";
import { num, pct } from "@/lib/format";
import Footer from "@/components/Footer";

export const metadata: Metadata = { title: "How this works · AML Alert Queue (fictional data)" };

const PATTERNS = [
  ["Structuring", "repeated deposits just under €10.000 within a few days"],
  ["Pass-through (mule)", "money in from many senders, out again within 48 hours to one or two recipients"],
  ["Fan-in", "many unrelated senders paying into one private account"],
  ["Dormant then spike", "a quiet account suddenly moves far more than its declared volume"],
  ["High-risk corridor", "large or frequent transfers to a high-risk-tier invented country"],
  ["Purpose mismatch", "declared savings or family support, but the account behaves like a business"],
];

export default function HowItWorks() {
  const s = meta.scores;
  const ai = s?.ai;
  const tiers = (t: string) => Object.entries(meta.countries).filter(([, v]) => v === t).map(([k]) => k).join(", ");
  return (
    <main className="page">
      <p className="back"><Link href="/">← Back to the alert queue</Link></p>
      <article className="card prose">
        <h1>How this works</h1>
        <p className="notice">{meta.notice} Nothing here comes from a real company, customer or employer.</p>

        <h2>The idea</h2>
        <p>Rules flag transfers that look suspicious. Alerts on the same customer within 14 days become one case. For every case,
          an AI model drafts a short note and suggests a next step: escalate, or close as a false positive. An analyst decides.
          The AI never decides and never says that anyone committed a crime; it describes behaviour.</p>
        <p>The first KPI, &quot;AI suggests escalation&quot;, counts the cases raised in the selected month that the AI suggests
          escalating. These are suggestions only: no analyst decisions exist in this demo.</p>

        <h2>The data</h2>
        <p>{num(2000)} invented customers of Lysbro Pay ApS (fictional) and their transfers from Jan to Sep 2026 (Jan-Mar only as
          history for the rules). Normal behaviour depends on the customer type and declared purpose, and includes things that
          look unusual but are not: bonus months, holiday spending, a one-off car purchase, seasonal businesses.</p>
        <p>Into this, 30 truly suspicious customers were planted, five for each pattern below. Six show a second pattern, and
          six show only a weak version built to fall just under a rule threshold, so some misses are expected. Which customers
          were planted is stored in one answer-key file that only the evaluation script reads.</p>
        <ul>{PATTERNS.map(([n, d]) => <li key={n}><strong>{n}</strong>: {d}</li>)}</ul>
        <p>Countries outside Denmark are invented, so no real country is labelled high-risk. Risk tiers (own assumptions):
          low {tiers("low")}; medium {tiers("medium")}; high {tiers("high")}.</p>

        <h2>Rules and thresholds</h2>
        <p>Every threshold and weight is an own assumption, set in one file (config/rules.yaml). None comes from a law, regulator or employer.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Rule</th><th>Fires when</th><th className="num">Weight</th></tr></thead>
            <tbody>{Object.entries(meta.rules).map(([id, r]) => <tr key={id}><td className="nowrap">{id} {r.name}</td><td>{r.how}</td><td className="num">{r.weight}</td></tr>)}</tbody>
          </table>
        </div>
        <p>A rule alerts again on the same customer only after 30 quiet days, so a busy account does not raise an alert every day.</p>

        <h2>Risk score</h2>
        <p>Risk score = rule points + KYC points + amount points, at most 100. Rule points are the weights of the rules hit.
          KYC points: low {meta.risk_score.kyc_points.low}, medium {meta.risk_score.kyc_points.medium}, high {meta.risk_score.kyc_points.high}.
          Amount points: up to {meta.risk_score.amount_points_max}, reached when the amount involved is {meta.risk_score.amount_ratio_full} times
          the declared monthly volume. The queue shows 60 or more in red as high risk.</p>

        <h2>Counterparty network</h2>
        <p>Every case opens with a network picture: the case customer in the middle, and everyone they sent money to or received
          money from in the 90 days up to and including the case date. Senders who only pay in sit on the left, receivers who only
          get paid sit on the right, so fan-in (many senders, one account) and pass-through (money in from many, out again to one or
          two) read left to right. Node size is the amount, arrow width is the amount in that direction, a red ring marks a
          counterparty in a high-risk-tier invented country. Selecting a transaction in the timeline highlights its arrow, and the
          other way round.</p>
        <p>It is built in SQL (sql/17_v_case_network.sql) from the raw transactions only: nothing after the case date, nothing from
          the answer key. To stay readable it shows at most 25 counterparties, the largest by amount; the rest are grouped as
          &quot;+N others&quot;. The view also looks for other Lysbro Pay customers who dealt with the same counterparties in the same
          window. In this synthetic data there are none: every counterparty belongs to one customer, so each network is one customer
          and their counterparties.</p>

        <h2>What the AI sees, and what it does not</h2>
        <p>Sees: the customer profile (type, customer since, declared purpose and monthly volume, home country, KYC rating),
          the rules hit with their reasons, the triggering transactions, and a summary of the 90 days before the first alert.
          Every amount is pre-formatted, so the model copies numbers instead of calculating them.</p>
        <p>Does not see: the customer&apos;s name, the name-origin group, anything after the case date, or the answer key.</p>
        <p>Model: {meta.ai_run?.model ?? "claude-haiku-5-5"}, one prompt version, run once. Output: a 60-100 word summary,
          the suggestion, 1-3 reasons and a checklist of what the analyst must check that the data cannot show.</p>

        <h2>How it is checked</h2>
        <p>A script without AI checks every draft: each number must appear in the case data, no date may be after the case date,
          all fields must be there, word limits, and a list of banned words (including any claim of crime or guilt). A failed
          draft gets one follow-up listing the failures, at most two retries, and the last attempt is kept.
          {ai && ` Result: ${ai.number_check_first_attempt_passed} of ${ai.drafts} drafts passed on the first attempt, ${ai.number_check_final_passed} of ${ai.drafts} in the end.`}</p>

        <h2>How it is evaluated</h2>
        <p>A case counts as truly suspicious if it is on a planted customer and dated on or after the pattern started. The metrics
          were written down before the AI ran and were not changed afterwards.</p>
        {s && <ul>
          <li>Rule precision: {s.overall.true_positive_cases} of {s.overall.cases} cases ({pct(s.overall.precision_pct)}) were truly suspicious.</li>
          <li>Recall: {s.overall.planted_customers_caught} of {s.overall.planted_customers} planted customers caught ({pct(s.overall.recall_pct)});
            full versions {s.recall_by_strength.full.caught} of {s.recall_by_strength.full.planted}, weak versions {s.recall_by_strength.weak.caught} of {s.recall_by_strength.weak.planted}.</li>
          {ai && <li>AI: suggested escalating {ai.table.suspicious_escalate} of {ai.table.suspicious_escalate + ai.table.suspicious_close} truly
            suspicious cases ({pct(ai.escalation_rate_on_suspicious_pct)}) and closing {ai.table.not_suspicious_close} of {ai.table.not_suspicious_close + ai.table.not_suspicious_escalate} false
            positives ({pct(ai.close_rate_on_false_positives_pct)}).</li>}
        </ul>}

        <h2>Fairness check</h2>
        <p>Every customer has an invented name-origin group, kept in a separate file that the rules, the AI and this dashboard
          never read. The planted customers were drawn so that their name-origin mix matches everyone else&apos;s, and the generator
          checks it: {meta.fairness.passed ? "PASS" : "FAIL"}, largest difference {num(meta.fairness.max_difference_pp, 1)} percentage points
          (limit {meta.fairness.planted_mix_within_pp}).
          {s && " The evaluation also reports, per group, the share of customers with a case and the AI escalation rate:"}</p>
        {s && <div className="tablewrap"><table>
          <thead><tr><th>Group</th><th className="num">Share of customers</th><th className="num">Share of cases</th><th className="num">Customers with a case</th><th className="num">AI escalates</th></tr></thead>
          <tbody>{Object.entries(s.fairness_by_name_origin_group).map(([g, f]) => (
            <tr key={g}><td>{`Group ${g.slice(-1).toUpperCase()}`}</td><td className="num">{pct(f.share_of_customers_pct)}</td>
              <td className="num">{pct(f.share_of_cases_pct)}</td><td className="num">{pct(f.customers_with_case_pct)}</td><td className="num">{pct(f.ai_escalation_rate_pct)}</td></tr>))}
          </tbody></table></div>}
        <p className="small muted">This shows the design does not use name origin. It does not prove fairness on real data, where
          traits like nationality can correlate with home country or transfer corridors.</p>

        <h2>Limitations</h2>
        <ul>
          <li>The data is synthetic. R3 and R6 at 100 % precision are an artefact of how normal customers were generated: they rarely have many senders or counterparties. Real data would not be this clean.</li>
          <li>The AI run: the first launch made no calls (a compression bug), the second crashed after 11 cases (a script bug). The 11 drafts were archived unread, the script was fixed, and the full run was done once with the unchanged prompt, checks and cap.
            {meta.ai_run?.spend_usd != null && ` The complete run cost USD ${num(meta.ai_run.spend_usd, 2)}; total AI cost about USD 0,16.`}</li>
          {ai && <li>{ai.drafts - ai.number_check_final_passed} of {ai.drafts} drafts still fail the check after retries (word limit only) and are shown as failing.</li>}
          <li>One run, one prompt version. Variation between runs is not measured.</li>
          <li>The fairness check covers name origin only, on 25 to 90 cases per group. It is reported, not tested statistically.</li>
          <li>Thresholds and risk weights are own assumptions, not taken from any regulator or employer, and not tuned on real data.</li>
          <li>No analyst decisions exist. The queue shows suggestions only, and precision and recall come from an answer key, not from analyst outcomes.</li>
          <li>The network view can link customers through shared counterparties, but the generator gave every counterparty to one customer only, so no such links exist here. It shows money flows, not why the money moved, and it cannot see accounts outside Lysbro Pay beyond the counterparty id.</li>
        </ul>
      </article>
      <Footer />
    </main>
  );
}
