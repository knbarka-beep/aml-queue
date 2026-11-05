"use client";

import { useEffect, useRef } from "react";
import { caseTransactions, customers, meta, transactions, type Case } from "@/lib/data";
import { dateDk, eur, label, num } from "@/lib/format";
import { Score, Suggestion } from "./Badges";
import Timeline from "./Timeline";

/** Drill-down for one case. Shows only data up to the case date. Native <dialog>: Esc closes, focus stays inside. */
export default function CaseDrawer({ c, onClose }: { c: Case | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (c && !d.open) d.showModal();
    if (!c && d.open) d.close();
  }, [c]);

  return (
    <dialog ref={ref} className="drill" aria-labelledby="drill-title" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {c && <Body c={c} onClose={onClose} />}
    </dialog>
  );
}

function Body({ c, onClose }: { c: Case; onClose: () => void }) {
  const cust = customers[c.customer_id];
  const trig = new Set(caseTransactions.filter((t) => t.case_id === c.case_id).map((t) => t.transaction_id));
  const from = new Date(c.first_alert_date);
  from.setDate(from.getDate() - 90);
  const fromIso = from.toISOString().slice(0, 10);
  const txs = transactions.filter((t) => t.customer_id === c.customer_id && t.ts.slice(0, 10) >= fromIso && t.ts.slice(0, 10) <= c.case_date);
  const triggering = txs.filter((t) => trig.has(t.transaction_id));
  const counterpartiesTrig = new Set(triggering.map((t) => t.counterparty_id)).size;

  return (
    <>
      <div className="drill-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 id="drill-title">{c.case_id} <span className="muted small">case date {dateDk(c.case_date)}</span></h2>
          <div className="small">Risk score <Score value={c.risk_score} /> · <Suggestion ai={c.ai} /> · <span className="badge badge-status">{c.status}</span></div>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close case">✕</button>
      </div>
      <div className="drill-body">
        <p className="decide">AI suggestion only. An analyst decides.</p>

        <section className="stack">
          <h3>Customer profile</h3>
          <dl className="facts">
            <div><dt>Customer</dt><dd>{cust.customer_id} · {label(cust.customer_type)}</dd></div>
            <div><dt>Customer since</dt><dd>{dateDk(cust.onboarding_date)}</dd></div>
            <div><dt>KYC risk rating</dt><dd>{label(cust.kyc_risk_rating)}</dd></div>
            <div><dt>Home country</dt><dd>{cust.home_country} ({cust.home_country_tier})</dd></div>
            <div><dt>Declared purpose</dt><dd>{label(cust.declared_purpose)}</dd></div>
            <div><dt>Declared monthly volume</dt><dd>{eur(cust.expected_monthly_volume_eur)}</dd></div>
          </dl>
        </section>

        <section className="stack">
          <h3>Declared vs actual</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th></th><th className="num">Declared</th><th className="num">90 days before first alert</th><th className="num">Triggering transactions</th></tr></thead>
              <tbody>
                <tr><td>Monthly volume (in + out)</td><td className="num">{eur(c.expected_monthly_volume_eur)}</td>
                  <td className="num">{eur(c.avg_monthly_volume_90d_eur)} a month</td><td className="num">{eur(c.amount_involved_eur)} in total</td></tr>
                <tr><td>Different counterparties</td><td className="num">n/a</td><td className="num">{c.counterparties_90d}</td>
                  <td className="num">{counterpartiesTrig || "n/a"}</td></tr>
                <tr><td>Transactions</td><td className="num">n/a</td><td className="num">{c.tx_90d}</td><td className="num">{c.n_transactions}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="stack">
          <h3>Transactions, 90 days before the first alert to the case date</h3>
          <Timeline txs={txs} triggering={trig} caseDate={c.case_date} />
          <p className="legend"><span className="trig">Triggered the case</span><span>Other transactions</span></p>
        </section>

        <section className="stack">
          <h3>Rules hit</h3>
          {c.alerts.map((a) => (
            <div key={a.alert_id} className="quote">
              <p><strong>{a.rule_id} {a.rule_name}</strong> <span className="muted small">alert {dateDk(a.alert_date)}</span></p>
              <p>{a.reason}.</p>
              <p className="small muted">Rule: {meta.rules[a.rule_id].how}</p>
            </div>
          ))}
          <p className="small muted">Risk score {c.risk_score} = rule points {c.rule_points} + KYC points {c.kyc_points} + amount points {num(c.amount_points, 1)} (capped at 100).</p>
        </section>

        <section className="stack">
          <h3>AI draft</h3>
          {c.ai ? (
            <>
              <p className="quote">{c.ai.summary}</p>
              <p><strong>Suggested next step:</strong> <Suggestion ai={c.ai} /></p>
              <div><strong>Reasons</strong><ul>{c.ai.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
              <div><strong>For the analyst to check</strong>
                <ul className="checklist">{c.ai.missing.map((m, i) => <li key={i}>{m.replace(/^\[Analyst:\s*/, "").replace(/\]$/, "")}</li>)}</ul></div>
              <p className="small muted">
                {c.ai.check_passed
                  ? `Automatic checks passed (numbers, dates, wording, length) on attempt ${c.ai.attempts} of 3.`
                  : `Automatic checks still failing after ${c.ai.attempts} attempts: ${c.ai.failed_checks.join("; ")}.`}
                {" "}Drafted by {c.ai.model}, prompt {c.ai.prompt_version}.
              </p>
            </>
          ) : (
            <p className="muted">No AI draft for this case. The analyst works from the data above.</p>
          )}
        </section>

        <section className="stack">
          <h3>Triggering transactions ({c.n_transactions})</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>Direction</th><th className="num">Amount</th><th>Country</th><th className="hide-sm">Channel</th></tr></thead>
              <tbody>
                {transactions.filter((t) => trig.has(t.transaction_id)).map((t) => (
                  <tr key={t.transaction_id}>
                    <td className="nowrap">{dateDk(t.ts)} <span className="muted small">{t.ts.slice(11, 16)}</span></td>
                    <td>{t.direction === "in" ? "In" : "Out"}</td>
                    <td className="num">{eur(t.amount_eur)}</td>
                    <td>{t.counterparty_country}{t.country_tier === "high" ? " (high-risk tier)" : ""}</td>
                    <td className="hide-sm">{label(t.channel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
