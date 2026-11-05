import type { AiDraft } from "@/lib/data";
import { isHighRisk } from "@/lib/format";

/** AI suggestion. Red only for "escalate". */
export function Suggestion({ ai }: { ai: AiDraft | null }) {
  if (!ai) return <span className="badge badge-none">No AI draft</span>;
  return ai.suggestion === "escalate"
    ? <span className="badge badge-escalate">Escalate</span>
    : <span className="badge badge-close">Close as false positive</span>;
}

/** Risk score with a small bar; red from 60 (high risk). */
export function Score({ value }: { value: number }) {
  const high = isHighRisk(value);
  return (
    <span className={`score${high ? " high" : ""}`} title={high ? "High risk (60 or more)" : undefined}>
      {value}
      <span className="score-bar" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
      {high && <span className="sr-only">high risk</span>}
    </span>
  );
}
