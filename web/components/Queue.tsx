"use client";

import { useState } from "react";
import { cases, meta } from "@/lib/data";
import { dateDk, eurShort, label, monthLabel } from "@/lib/format";
import { Score, Suggestion } from "./Badges";

/** The alert queue: cases sorted by risk score, with filters by rule and by AI suggestion. */
export default function Queue({ month, onOpen }: { month: string; onOpen: (id: string) => void }) {
  const [rule, setRule] = useState("all");
  const [suggestion, setSuggestion] = useState("all");
  const [earlier, setEarlier] = useState(false);

  const rows = cases
    .filter((c) => (earlier ? c.case_month <= month : c.case_month === month))
    .filter((c) => rule === "all" || c.rules_hit.includes(rule))
    .filter((c) => suggestion === "all" || (suggestion === "none" ? !c.ai : c.ai?.suggestion === suggestion))
    .sort((a, b) => b.risk_score - a.risk_score || a.case_id.localeCompare(b.case_id));

  return (
    <div className="card">
      <div className="section-head stack" style={{ marginBottom: 12 }}>
        <h2>{earlier ? `All open cases up to ${monthLabel(month)}` : `Cases raised in ${monthLabel(month)}`}, highest risk first</h2>
        <p className="small muted">Select a case to see the customer, the transactions, the rules hit and the AI draft.</p>
      </div>
      <div className="filters">
        <label>Rule
          <select value={rule} onChange={(e) => setRule(e.target.value)}>
            <option value="all">All rules</option>
            {Object.entries(meta.rules).map(([id, r]) => <option key={id} value={id}>{id} {r.name}</option>)}
          </select>
        </label>
        <label>AI suggestion
          <select value={suggestion} onChange={(e) => setSuggestion(e.target.value)}>
            <option value="all">All</option>
            <option value="escalate">Escalate</option>
            <option value="close as false positive">Close as false positive</option>
            <option value="none">No AI draft</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={earlier} onChange={(e) => setEarlier(e.target.checked)} />
          Include earlier open cases</label>
        <span className="small muted" aria-live="polite">{rows.length} cases</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th className="hide-sm">Customer</th>
              <th>Rules hit</th>
              <th className="num">Amount</th>
              <th>Risk</th>
              <th>AI suggestion</th>
              <th className="hide-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.case_id} className="row" onClick={() => onOpen(c.case_id)}>
                <td>
                  <button className="rowbtn" onClick={(e) => { e.stopPropagation(); onOpen(c.case_id); }}>{c.case_id}</button>
                  <div className="small muted">{dateDk(c.case_date)}</div>
                </td>
                <td className="hide-sm">{label(c.customer_type)}<div className="small muted">{label(c.declared_purpose)}</div></td>
                <td>{c.rules_hit.map((r) => <span key={r} className="chip" title={meta.rules[r].name}>{r}<span className="hide-sm"> {meta.rules[r].name}</span></span>)}</td>
                <td className="num">{eurShort(c.amount_involved_eur)}</td>
                <td><Score value={c.risk_score} /></td>
                <td><Suggestion ai={c.ai} /></td>
                <td className="hide-sm"><span className="badge badge-status">{c.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No cases match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
