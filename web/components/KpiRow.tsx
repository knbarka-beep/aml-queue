"use client";

import { cases, meta, type MonthKpi } from "@/lib/data";
import { monthLabel, pct, signed } from "@/lib/format";
import { InfoTip } from "./kit/InfoTip";

type Kpi = { id: string; title: string; value: React.ReactNode; sub: string; explain: string; bar?: number };

/** Four key figures. Each has an (i) popover that says how it is calculated (keyboard reachable, Esc closes). */
export default function KpiRow({ kpi }: { kpi: MonthKpi }) {
  const s = meta.scores?.overall;
  const prev = monthLabel(meta.months[Math.max(0, meta.months.indexOf(kpi.month) - 1)]);
  const delta = kpi.cases_in_month - kpi.cases_prev_month;
  const inMonth = cases.filter((c) => c.case_month === kpi.month);
  const escalate = inMonth.filter((c) => c.ai?.suggestion === "escalate").length;
  const items: Kpi[] = [
    { id: "esc", title: "AI suggests escalation", value: <>{escalate} <span className="of">of {inMonth.length}</span></>,
      sub: `cases raised in ${monthLabel(kpi.month)}`,
      explain: "Cases raised in the selected month that the AI suggests escalating. Suggestions only. No analyst decisions exist in this demo." },
    { id: "month", title: "Cases this month", value: String(kpi.cases_in_month),
      sub: kpi.month === meta.months[0] ? "first month of data" : `${signed(delta)} vs ${prev}`,
      explain: "Cases whose case date (the date of the last alert in the case) falls in the selected month. Alerts on one customer within 14 days form one case." },
    { id: "prec", title: "Rule precision", value: s ? pct(s.precision_pct) : "n/a",
      sub: s ? `${s.true_positive_cases} of ${s.cases} cases truly suspicious, Apr-Sep` : "evaluation not run yet",
      bar: s ? s.true_positive_cases / s.cases : undefined,
      explain: "Share of all cases (Apr-Sep 2026) that were on a planted suspicious customer, on or after the pattern started. Most alerts are false positives. Measured against the answer key of the synthetic data; a real team would measure it from analyst decisions." },
    { id: "recall", title: "Planted patterns caught", value: s ? <>{s.planted_customers_caught} <span className="of">of {s.planted_customers}</span></> : "n/a",
      sub: s ? `recall ${pct(s.recall_pct)}, Apr-Sep` : "evaluation not run yet",
      explain: "Planted suspicious customers with at least one case after their pattern started, out of all planted customers. Six were planted as weak versions just under a rule threshold." },
  ];
  return (
    <section className="kpis" aria-label="Key figures">
      {items.map((k) => (
        <div key={k.id} className="kpi">
          <div className="kpi-head">
            <h3>{k.title}</h3>
            <InfoTip label={`how "${k.title}" is calculated`} align={k.id === "recall" ? "right" : "left"}><p>{k.explain}</p></InfoTip>
          </div>
          <p className="value">{k.value}</p>
          <p className="sub">{k.sub}</p>
          {k.bar != null && <div className="prop" role="img" aria-label={k.sub}><span style={{ width: `${k.bar * 100}%` }} /></div>}
        </div>
      ))}
    </section>
  );
}
