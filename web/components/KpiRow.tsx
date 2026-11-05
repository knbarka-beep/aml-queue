"use client";

import { useState } from "react";
import { cases, meta, type MonthKpi } from "@/lib/data";
import { monthLabel, pct, signed } from "@/lib/format";

type Kpi = { id: string; title: string; value: string; sub: string; explain: string };

/** Four KPIs. Each has an "i" button that shows how it is calculated (tap or hover). */
export default function KpiRow({ kpi }: { kpi: MonthKpi }) {
  const s = meta.scores?.overall;
  const prev = monthLabel(meta.months[Math.max(0, meta.months.indexOf(kpi.month) - 1)]);
  const delta = kpi.cases_in_month - kpi.cases_prev_month;
  const inMonth = cases.filter((c) => c.case_month === kpi.month);
  const escalate = inMonth.filter((c) => c.ai?.suggestion === "escalate").length;
  const items: Kpi[] = [
    { id: "esc", title: "AI suggests escalation", value: `${escalate} of ${inMonth.length}`,
      sub: `cases raised in ${monthLabel(kpi.month)}`,
      explain: "Cases raised in the selected month that the AI suggests escalating. Suggestions only. No analyst decisions exist in this demo." },
    { id: "month", title: "Cases this month", value: String(kpi.cases_in_month),
      sub: kpi.month === meta.months[0] ? "first month of data" : `${signed(delta)} vs ${prev}`,
      explain: "Cases whose case date (the date of the last alert in the case) falls in the selected month. Alerts on one customer within 14 days form one case." },
    { id: "prec", title: "Rule precision", value: s ? pct(s.precision_pct) : "n/a",
      sub: s ? `${s.true_positive_cases} of ${s.cases} cases truly suspicious, Apr-Sep` : "evaluation not run yet",
      explain: "Share of all cases (Apr-Sep 2026) that were on a planted suspicious customer, on or after the pattern started. Measured against the answer key of the synthetic data; a real team would measure it from analyst decisions." },
    { id: "recall", title: "Planted patterns caught", value: s ? `${s.planted_customers_caught} of ${s.planted_customers}` : "n/a",
      sub: s ? `recall ${pct(s.recall_pct)}, Apr-Sep` : "evaluation not run yet",
      explain: "Planted suspicious customers with at least one case after their pattern started, out of all planted customers. Six were planted as weak versions just under a rule threshold." },
  ];
  return (
    <section className="kpis" aria-label="Key figures">
      {items.map((k) => <KpiCard key={k.id} k={k} />)}
    </section>
  );
}

function KpiCard({ k }: { k: Kpi }) {
  const [show, setShow] = useState(false);
  return (
    <div className="card kpi" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="kpi-head">
        <h3>{k.title}</h3>
        <button className="info" aria-label={`How "${k.title}" is calculated`} aria-expanded={show}
          aria-controls={`explain-${k.id}`} onClick={() => setShow((v) => !v)}>i</button>
      </div>
      <p className="value">{k.value}</p>
      <p className="small muted">{k.sub}</p>
      <p id={`explain-${k.id}`} className="explain" hidden={!show}>{k.explain}</p>
    </div>
  );
}
