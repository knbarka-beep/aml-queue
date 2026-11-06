"use client";
// Counterparty network for one case (data: sql/17_v_case_network.sql via web/data/case_network.json).
// Layout: d3-force, run to the end before the first paint (300 ticks), so the picture is still from the start.
// Senders who only pay in are pulled to the left, receivers who only get paid to the right, so fan-in and
// pass-through read left to right. The case customer sits in the middle in the accent colour.
// Loaded only when a case is opened (next/dynamic), so the queue page does not carry d3 or the network data.
import { useMemo, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import netRaw from "../data/case_network.json";
import { eur, eurShort, num } from "@/lib/format";

type Row = {
  case_id: string; customer_id: string; is_case_customer: boolean; node_id: string; counterparty_country: string | null;
  country_tier: string | null; counterparties: number; direction: "in" | "out"; n_transfers: number; amount_eur: number;
};
const ROWS = netRaw as unknown as Row[];

/** What is highlighted: a counterparty (raw id from a transaction, or a node id), optionally one direction. */
export type Pick = { cp: string; dir?: "in" | "out" } | null;

type Node = SimulationNodeDatum & {
  id: string; key: string; kind: "case" | "cp" | "others" | "cust"; r: number; country: string | null; tier: string | null;
  inAmt: number; outAmt: number; inN: number; outN: number; count: number;
};
type Edge = { id: string; s: Node; t: Node; key: string; dir: "in" | "out"; amount: number; n: number; w: number; offset: number };

export function cpName(id: string) {
  if (id === "OTHERS") return "Other counterparties";
  if (id.startsWith("OWN-")) return "Own account at another bank";
  if (id.startsWith("AGENT")) return `Cash agent ${id}`;
  return `Counterparty ${id}`;
}

function build(caseId: string) {
  const rows = ROWS.filter((r) => r.case_id === caseId);
  const nodes = new Map<string, Node>();
  const node = (id: string, key: string, kind: Node["kind"], r: Row) => {
    if (!nodes.has(id)) nodes.set(id, { id, key, kind, r: 0, country: kind === "cp" ? r.counterparty_country : null,
      tier: kind === "cp" ? r.country_tier : null, inAmt: 0, outAmt: 0, inN: 0, outN: 0, count: r.counterparties });
    return nodes.get(id)!;
  };
  const caseRow = rows.find((r) => r.is_case_customer)!;
  const center = node(`cust:${caseRow.customer_id}`, caseRow.customer_id, "case", caseRow);
  const edges: Edge[] = [];
  for (const r of rows) {
    const cp = node(`cp:${r.node_id}`, r.node_id, r.node_id === "OTHERS" ? "others" : "cp", r);
    const cust = r.is_case_customer ? center : node(`cust:${r.customer_id}`, r.customer_id, "cust", r);
    // Amounts in and out are seen from the customer: "in" means the counterparty paid the customer.
    if (r.is_case_customer) {
      if (r.direction === "in") { cp.inAmt += r.amount_eur; cp.inN += r.n_transfers; } else { cp.outAmt += r.amount_eur; cp.outN += r.n_transfers; }
    } else if (r.direction === "in") { cust.inAmt += r.amount_eur; cust.inN += r.n_transfers; } else { cust.outAmt += r.amount_eur; cust.outN += r.n_transfers; }
    const [s, t] = r.direction === "in" ? [cp, cust] : [cust, cp];
    edges.push({ id: `${s.id}>${t.id}`, s, t, key: r.node_id, dir: r.direction, amount: r.amount_eur, n: r.n_transfers, w: 0, offset: 0 });
  }
  const all = [...nodes.values()];
  const total = (n: Node) => n.inAmt + n.outAmt;
  const maxTotal = Math.max(...all.filter((n) => n.kind !== "case").map(total), 1);
  const maxEdge = Math.max(...edges.map((e) => e.amount), 1);
  for (const n of all) n.r = n.kind === "case" ? 22 : 6 + 18 * Math.sqrt(total(n) / maxTotal);
  for (const e of edges) {
    e.w = 1.2 + 6 * Math.sqrt(e.amount / maxEdge);
    // Money both ways between the same two nodes: draw the two arrows side by side.
    if (edges.some((o) => o.s === e.t && o.t === e.s)) e.offset = e.w / 2 + 2;
  }

  // Layout. Fixed random source, so the same case always gets the same picture.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  center.fx = 0; center.fy = 0;
  const side = (n: Node) => (n.kind === "case" ? 0 : n.inAmt > 0 && n.outAmt === 0 ? -260 : n.outAmt > 0 && n.inAmt === 0 ? 260 : 0);
  forceSimulation(all).randomSource(random)
    .force("link", forceLink(edges.map((e) => ({ source: e.s, target: e.t }))).distance((l) => 70 + (l.target as Node).r + (l.source as Node).r).strength(0.3))
    .force("charge", forceManyBody().strength(-240))
    .force("x", forceX<Node>(side).strength(0.16))
    .force("y", forceY(0).strength(0.07))
    .force("collide", forceCollide<Node>((n) => n.r + 10))
    .stop().tick(300);

  const pad = 34;
  const xs = all.map((n) => [n.x! - n.r, n.x! + n.r]).flat(), ys = all.map((n) => [n.y! - n.r, n.y! + n.r + 14]).flat();
  const box = { x: Math.min(...xs, -320) - pad, y: Math.min(...ys) - pad, w: 0, h: 0 };
  box.w = Math.max(...xs, 320) + pad - box.x;
  box.h = Math.max(Math.max(...ys) + pad - box.y, 260);
  const ranked = all.filter((n) => n.kind === "cp" || n.kind === "others").sort((a, b) => total(b) - total(a));
  const labelled = new Set(ranked.filter((n) => n.kind === "cp").slice(0, 5).filter((n) => n.r >= 10).map((n) => n.id));
  return { nodes: all, edges, box, ranked, labelled, total };
}

function describe(n: Node) {
  if (n.kind === "case") return `Case customer ${n.key}`;
  if (n.kind === "cust") return `Other customer ${n.key}`;
  if (n.kind === "others") return `${n.count} other counterparties, grouped`;
  return `${cpName(n.key)}, ${n.country}${n.tier === "high" ? " (high-risk tier)" : ""}`;
}

export default function Network({ caseId, pick, onPick }: { caseId: string; pick: Pick; onPick: (p: Pick) => void }) {
  const g = useMemo(() => build(caseId), [caseId]);
  const [hover, setHover] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  // A transaction's counterparty may sit in the grouped node.
  const pickKey = pick ? (g.nodes.some((n) => n.key === pick.cp && n.kind !== "case") ? pick.cp : "OTHERS") : null;
  const isHl = (e: Edge) => pickKey === e.key && (!pick?.dir || pick.dir === e.dir);
  const center = g.nodes.find((n) => n.kind === "case")!;
  const others = g.nodes.filter((n) => n.kind === "cust").length;
  const tip = g.nodes.find((n) => n.id === hover) ?? null;
  const toggle = (key: string) => onPick(pickKey === key && !pick?.dir ? null : { cp: key });

  return (
    <>
      <div className={`netbox${full ? " full" : ""}`}>
        <div className="netscroll">
        <span className="side-label left" aria-hidden="true">Paid in</span>
        <span className="side-label right" aria-hidden="true">Paid out</span>
        <svg viewBox={`${g.box.x} ${g.box.y} ${g.box.w} ${g.box.h}`} role="group"
          aria-label={`Counterparty network of ${center.key}: ${g.ranked.length} counterparty nodes. Each node is a button; the same figures are in the list below.`}>
          <defs>
            {(["n", "hl"] as const).map((m) => (
              <marker key={m} id={`arrow-${m}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0L10 5L0 10z" fill={m === "hl" ? "var(--accent)" : "var(--muted)"} />
              </marker>
            ))}
          </defs>
          {g.edges.map((e) => {
            const dx = e.t.x! - e.s.x!, dy = e.t.y! - e.s.y!, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
            const ox = -uy * e.offset, oy = ux * e.offset;
            const x1 = e.s.x! + ux * (e.s.r + 2) + ox, y1 = e.s.y! + uy * (e.s.r + 2) + oy;
            const x2 = e.t.x! - ux * (e.t.r + 3) + ox, y2 = e.t.y! - uy * (e.t.r + 3) + oy;
            const hl = isHl(e);
            const d = `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
            return (
              <g key={e.id} onClick={() => onPick(hl && pick?.dir ? null : { cp: e.key, dir: e.dir })}>
                <path d={d} className={`edge${hl ? " hl" : pickKey ? " dim" : ""}`} strokeWidth={e.w} markerEnd={`url(#arrow-${hl ? "hl" : "n"})`} />
                <path d={d} className="edge-hit" strokeWidth={Math.max(e.w, 12)} />
              </g>
            );
          })}
          {g.nodes.map((n) => {
            const on = n.kind !== "case" && pickKey === n.key;
            const label = n.kind === "case" ? n.key : n.kind === "others" ? `+${n.count} others` : g.labelled.has(n.id) ? eurShort(g.total(n)) : "";
            return (
              <g key={n.id} transform={`translate(${n.x!.toFixed(1)} ${n.y!.toFixed(1)})`}
                className={`node ${n.kind === "case" ? "case" : n.kind}${on ? " hl" : ""}${pickKey && !on && n.kind !== "case" ? " dim" : ""}`}
                tabIndex={0} role="button" aria-pressed={n.kind === "case" ? undefined : on}
                aria-label={`${describe(n)}. In ${eur(n.inAmt)} (${n.inN} transfers), out ${eur(n.outAmt)} (${n.outN} transfers).`}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                onClick={() => { setHover(n.id); if (n.kind !== "case") toggle(n.key); }}
                onKeyDown={(ev) => { if ((ev.key === "Enter" || ev.key === " ") && n.kind !== "case") { ev.preventDefault(); toggle(n.key); } }}>
                <circle className="focus" r={n.r + 5} />
                <circle className="body" r={n.r} />
                {n.tier === "high" && <circle className="risk" r={n.r + 2.5} />}
                {label && <text y={n.r + 14} textAnchor="middle" className={n.kind === "cp" ? "amt" : undefined}>{label}</text>}
              </g>
            );
          })}
        </svg>
        {tip && (
          <div className="nettip" role="status" style={{ left: `${((tip.x! - g.box.x) / g.box.w) * 100}%`, top: `${((tip.y! - tip.r - g.box.y) / g.box.h) * 100}%` }}>
            <div className="t">{describe(tip)}</div>
            {tip.kind === "case"
              ? <div className="r"><span>Counterparties</span><span>{num(g.ranked.reduce((s, n) => s + n.count, 0))}</span></div>
              : <>
                  <div className="r"><span>Paid in</span><span>{eur(tip.inAmt)} · {tip.inN}</span></div>
                  <div className="r"><span>Paid out</span><span>{eur(tip.outAmt)} · {tip.outN}</span></div>
                  <div className="r"><span>Transfers</span><span>{tip.inN + tip.outN}</span></div>
                </>}
          </div>
        )}
        </div>
        <button type="button" className="btn fullbtn" aria-pressed={full} onClick={() => setFull(!full)}>{full ? "Fit to screen" : "View full network"}</button>
      </div>
      <p className="caption">
        Look for many senders paying in on the left and one or two receivers paying out on the right. The picture describes
        behaviour; it does not say what the money was for.
        {others === 0 && " No counterparty here also dealt with another Lysbro Pay customer in this window."}
      </p>
      <div className="legend" aria-hidden="true">
        <span className="key"><i className="dot cust" />Case customer</span>
        <span className="key"><i className="dot" />Counterparty, size by amount</span>
        <span className="key"><i className="dot ring" />High-risk-tier country</span>
        <span className="key">Arrow: direction of the money, width by amount</span>
      </div>
      <details className="cplist" open={typeof window !== "undefined" && window.innerWidth < 600}>
        <summary>Counterparties as a ranked list ({g.ranked.reduce((s, n) => s + n.count, 0)})</summary>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Counterparty</th><th>Country</th><th className="num">Paid in</th><th className="num">Paid out</th><th className="num">Transfers</th></tr></thead>
            <tbody>
              {g.ranked.map((n) => (
                <tr key={n.id} className={pickKey === n.key ? "picked" : undefined}>
                  <td><button className="linkbtn" aria-pressed={pickKey === n.key} onClick={() => toggle(n.key)}>
                    {n.kind === "others" ? `+${n.count} others (grouped)` : cpName(n.key)}</button></td>
                  <td>{n.country ?? "mixed"}{n.tier === "high" && <span className="badge negative" style={{ marginLeft: 6 }}>high-risk tier</span>}</td>
                  <td className="num">{eur(n.inAmt)}</td>
                  <td className="num">{eur(n.outAmt)}</td>
                  <td className="num">{n.inN + n.outN}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
