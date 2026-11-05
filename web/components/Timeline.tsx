"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Tx } from "@/lib/data";
import { dateDk, eur, eurShort } from "@/lib/format";

type Point = { x: number; y: number; t: Tx };

/** Each dot is a transaction: money in above the line, money out below. Triggering transactions in the accent colour. */
export default function Timeline({ txs, triggering, caseDate }: { txs: Tx[]; triggering: Set<string>; caseDate: string }) {
  const toPoint = (t: Tx): Point => ({ x: new Date(t.ts.replace(" ", "T")).getTime(), y: t.direction === "in" ? t.amount_eur : -t.amount_eur, t });
  const trig = txs.filter((t) => triggering.has(t.transaction_id)).map(toPoint);
  const other = txs.filter((t) => !triggering.has(t.transaction_id)).map(toPoint);
  const caseX = new Date(`${caseDate}T23:59`).getTime();
  return (
    <div style={{ width: "100%", height: 240 }} role="img"
      aria-label={`Timeline of ${txs.length} transactions, ${trig.length} of them triggered the case. Money in above zero, money out below.`}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" dataKey="x" domain={["dataMin", caseX]} scale="time" tickFormatter={(v) => dateDk(new Date(v).toISOString()).slice(0, 5)}
            tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" />
          <YAxis type="number" dataKey="y" tickFormatter={(v) => eurShort(v)} width={56} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <ReferenceLine x={caseX} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: "case date", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} />
          <Tooltip cursor={false} content={({ payload }) => {
            const p = payload?.[0]?.payload as Point | undefined;
            if (!p) return null;
            return (
              <div className="tooltip">
                <div><strong>{dateDk(p.t.ts)}</strong> {p.t.ts.slice(11, 16)}</div>
                <div>{p.t.direction === "in" ? "In" : "Out"} {eur(p.t.amount_eur)}, {p.t.counterparty_country}</div>
                {triggering.has(p.t.transaction_id) && <div>Triggered the case</div>}
              </div>
            );
          }} />
          <Scatter data={other} fill="var(--dot)" isAnimationActive={false} />
          <Scatter data={trig} fill="var(--accent)" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
