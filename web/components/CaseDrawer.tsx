"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { caseTransactions, customers, meta, transactions, type Case } from "@/lib/data";
import { dateDk, eur, label, num } from "@/lib/format";
import { Score, Suggestion } from "./Badges";
import Timeline from "./Timeline";
import { InfoTip } from "./kit/InfoTip";
import type { Pick } from "./Network";

// The network and its data load only when a case opens, so the queue stays light.
const Network = dynamic(() => import("./Network"), { ssr: false, loading: () => <div className="netbox" style={{ height: 320 }} /> });

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
      {c && <Body key={c.case_id} c={c} onClose={onClose} />}
    </dialog>
  );
}

function Body({ c, onClose }: { c: Case; onClose: () => void }) {
  const [pick, setPick] = useState<Pick>(null);
  const cust = customers[c.customer_id];
  const trig = new Set(caseTransactions.filter((t) => t.case_id === c.case_id).map((t) => t.transaction_id));
  const from = new Date(c.first_alert_date);
  from.setDate(from.getDate() - 90);
  const fromIso = from.toISOString().slice(0, 10);
  const txs = transactions.filter((t) => t.customer_id === c.customer_id && t.ts.slice(0, 10) >= fromIso && t.ts.slice(0, 10) <= c.case_date);
  const triggering = txs.filter((t) => trig.has(t.transaction_id));
  const counterpartiesTrig = new Set(triggering.map((t) => t.counterparty_id)).size;
  const picked = pick?.cp ?? null;

  return (
    <>
      <div className="drill-head">
        <div>
          <h2 id="drill-title">{c.case_id}</h2>
          <div className="meta">
            <span className="muted">case date {dateDk(c.case_date)}</span>
            <span>Risk <Score value={c.risk_score} /></span>
            <Suggestion ai={c.ai} />
            <span className="badge badge-status">{c.status}</span>
          </div>
        </div>
        <button className="btn iconbtn" onClick={onClose} aria-label="Close case">
          <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
        </button>
      </div>
      <div className="drill-body">
        <p className="decide">AI suggestion only. An analyst decides.</p>

        <section className="network" aria-labelledby="net-title">
          <div className="network-head">
            <div className="network-title">
              <h3 id="net-title">Counterparty network, 90 days up to the case date</h3>
              <InfoTip label="the counterparty network">
                <p>Everyone {c.customer_id} sent money to or received money from between {dateDk(shift(c.case_date, -90))} and the case date.
                  Nothing after the case date. Built in SQL (sql/17_v_case_network.sql).</p>
                <p>The 25 counterparties with the largest amounts get their own node; the rest are grouped as &quot;+N others&quot;.
                  Hover, tap or Tab to a node for its amounts; select it to find its transactions in the timeline.</p>
              </InfoTip>
            </div>
            {pick && <button className="btn" onClick={() => setPick(null)}>Clear highlight</button>}
          </div>
          <Network caseId={c.case_id} pick={pick} onPick={setPick} />
        </section>

        <section className="stack">
          <h3>Transactions, 90 days before the first alert to the case date</h3>
          <Timeline txs={txs} triggering={trig} caseDate={c.case_date} picked={picked}
            onPick={(t) => setPick({ cp: t.counterparty_id, dir: t.direction })} />
          <p className="legend"><span className="key"><i className="dot fill" />Triggered the case</span><span className="key"><i className="dot" />Other transactions</span>
            <span className="key">Click a dot to find its counterparty in the network</span></p>
        </section>

        <div className="split">
          <section className="stack">
            <h3>AI draft</h3>
            {c.ai ? (
              <>
                <p className="quote ai-summary">{c.ai.summary}</p>
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

          <div className="stack" style={{ gap: 28 }}>
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
                  <thead><tr><th></th><th className="num">Declared</th><th className="num">90 days before first alert</th><th className="num">Triggering</th></tr></thead>
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
          </div>
        </div>

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
          <h3>Triggering transactions ({c.n_transactions})</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Date</th><th>Direction</th><th className="num">Amount</th><th>Country</th><th className="hide-sm">Channel</th></tr></thead>
              <tbody>
                {transactions.filter((t) => trig.has(t.transaction_id)).map((t) => (
                  <tr key={t.transaction_id} className={picked === t.counterparty_id ? "picked" : undefined}>
                    <td className="nowrap">
                      <button className="linkbtn" aria-pressed={picked === t.counterparty_id} title="Highlight in the network"
                        onClick={() => setPick({ cp: t.counterparty_id, dir: t.direction })}>{dateDk(t.ts)}</button>{" "}
                      <span className="muted small">{t.ts.slice(11, 16)}</span>
                    </td>
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

/** "2026-09-02", -90 -> "2026-06-04" */
function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
