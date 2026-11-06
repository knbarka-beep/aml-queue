"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Tx } from "@/lib/data";
import { dateDk, eur, eurShort } from "@/lib/format";

type Point = { x: number; y: number; t: Tx };

/** Each dot is a transaction: money in above the line, money out below. Triggering transactions are filled in the
 *  accent colour, others are hollow. Clicking a triggering dot highlights its counterparty in the network; the
 *  transactions of the counterparty picked in the network get a ring. */
export default function Timeline({ txs, triggering, caseDate, picked, onPick }: {
  txs: Tx[]; triggering: Set<string>; caseDate: string; picked: string | null; onPick: (t: Tx) => void;
}) {
  const toPoint = (t: Tx): Point => ({ x: new Date(t.ts.replace(" ", "T")).getTime(), y: t.direction === "in" ? t.amount_eur : -t.amount_eur, t });
  const trig = txs.filter((t) => triggering.has(t.transaction_id)).map(toPoint);
  const other = txs.filter((t) => !triggering.has(t.transaction_id)).map(toPoint);
  const caseX = new Date(`${caseDate}T23:59`).getTime();
  const dot = (filled: boolean) => function Dot(p: { cx?: number; cy?: number; payload?: Point }) {
    const on = picked != null && p.payload?.t.counterparty_id === picked;
    return (
      <g>
        {on && <circle cx={p.cx} cy={p.cy} r={8} fill="none" stroke="var(--accent)" strokeWidth={2} />}
        <circle className="recharts-symbols" cx={p.cx} cy={p.cy} r={filled ? 4.5 : 3.5} fill={filled ? "var(--accent)" : "var(--surface)"}
          stroke={filled ? "var(--accent)" : "var(--muted)"} strokeWidth={1.25} style={{ cursor: "pointer" }} />
      </g>
    );
  };
  return (
    <div style={{ width: "100%", height: 240 }} role="img"
      aria-label={`Timeline of ${txs.length} transactions, ${trig.length} of them triggered the case. Money in above zero, money out below. The triggering transactions are also listed in a table below.`}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" domain={["dataMin", caseX]} scale="time" tickFormatter={(v) => dateDk(new Date(v).toISOString()).slice(0, 5)}
            tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border-strong)" />
          <YAxis type="number" dataKey="y" tickFormatter={(v) => eurShort(v)} width={56} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border-strong)" />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <ReferenceLine x={caseX} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: "case date", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} />
          <Tooltip cursor={false} isAnimationActive={false} content={({ payload }) => {
            const p = payload?.[0]?.payload as Point | undefined;
            if (!p) return null;
            return (
              <div className="tooltip">
                <div><strong>{dateDk(p.t.ts)}</strong> {p.t.ts.slice(11, 16)}</div>
                <div>{p.t.direction === "in" ? "In" : "Out"} {eur(p.t.amount_eur)}, {p.t.counterparty_country}</div>
                <div className="muted">{triggering.has(p.t.transaction_id) ? "Triggered the case. Click to find it in the network." : "Click to find it in the network."}</div>
              </div>
            );
          }} />
          <Scatter data={other} shape={dot(false)} isAnimationActive={false} onClick={(d) => onPick((d as unknown as { payload: Point }).payload.t)} />
          <Scatter data={trig} shape={dot(true)} isAnimationActive={false} onClick={(d) => onPick((d as unknown as { payload: Point }).payload.t)} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
