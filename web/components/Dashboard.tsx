"use client";

import { useState } from "react";
import { cases, meta, monthlyKpis } from "@/lib/data";
import { monthLabel } from "@/lib/format";
import ThemeToggle from "./ThemeToggle";
import KpiRow from "./KpiRow";
import Queue from "./Queue";
import RulePerformance from "./RulePerformance";
import CaseDrawer from "./CaseDrawer";
import Footer from "./Footer";

/** The one main view: header, four KPIs, then the queue (or the rule performance tab). */
export default function Dashboard() {
  const [month, setMonth] = useState(meta.default_month);
  const [tab, setTab] = useState<"queue" | "rules">("queue");
  const [openId, setOpenId] = useState<string | null>(null);
  const kpi = monthlyKpis.find((k) => k.month === month)!;
  const open = cases.find((c) => c.case_id === openId) ?? null;

  return (
    <main className="page">
      <header className="header">
        <div className="stack" style={{ gap: 2 }}>
          <h1>{meta.company}: AML alert queue</h1>
          <p className="muted small">Rules flag transfers, AI drafts a case note, an analyst decides.</p>
        </div>
        <div className="controls">
          <label className="sr-only" htmlFor="month">Month</label>
          <select id="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {meta.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <ThemeToggle />
        </div>
      </header>
      <p className="notice">{meta.notice}</p>

      <KpiRow kpi={kpi} />

      <div className="tabs" role="tablist" aria-label="Views">
        <button role="tab" id="tab-queue" aria-controls="panel-queue" aria-selected={tab === "queue"} className="tab" onClick={() => setTab("queue")}>
          Alert queue
        </button>
        <button role="tab" id="tab-rules" aria-controls="panel-rules" aria-selected={tab === "rules"} className="tab" onClick={() => setTab("rules")}>
          Rule performance
        </button>
      </div>
      {tab === "queue"
        ? <section id="panel-queue" role="tabpanel" aria-labelledby="tab-queue"><Queue month={month} onOpen={setOpenId} /></section>
        : <section id="panel-rules" role="tabpanel" aria-labelledby="tab-rules"><RulePerformance /></section>}

      <Footer />
      <CaseDrawer c={open} onClose={() => setOpenId(null)} />
    </main>
  );
}
