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

/** The one main view: header, four key figures, then the queue (or the rule performance tab). */
export default function Dashboard() {
  const [month, setMonth] = useState(meta.default_month);
  const [tab, setTab] = useState<"queue" | "rules">("queue");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const kpi = monthlyKpis.find((k) => k.month === month)!;
  const open = cases.find((c) => c.case_id === openId) ?? null;
  const openCase = (id: string) => { setOpenId(id); setLastId(id); };

  return (
    <main className="page">
      <header className="site-header">
        <div className="bar">
          <h1>{meta.company} <span className="what">AML alert queue</span></h1>
          <div className="controls">
            <label className="sr-only" htmlFor="month">Month</label>
            <select id="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              {meta.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <p className="notice"><strong>All data is fictional.</strong> {meta.notice.replace("All data is fictional. ", "")} Rules flag transfers,
        AI drafts a case note, an analyst decides.</p>

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
        ? <section id="panel-queue" role="tabpanel" aria-labelledby="tab-queue"><Queue month={month} onOpen={openCase} selected={lastId} /></section>
        : <section id="panel-rules" role="tabpanel" aria-labelledby="tab-rules"><RulePerformance /></section>}

      <Footer />
      <CaseDrawer c={open} onClose={() => setOpenId(null)} />
    </main>
  );
}
