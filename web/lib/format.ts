// European display formats (same as scripts/fmt.py). Tested in format.test.ts.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 1.234,5 */
export const num = (v: number, decimals = 0) =>
  v.toLocaleString("da-DK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** €9.450 */
export const eur = (v: number) => `€${num(Math.round(v))}`;

/** €9,5k / €1,2m / €950 / −€3,0k */
export const eurShort = (v: number) => {
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}€${num(a / 1e6, 1)}m`;
  if (a >= 1e3) return `${sign}€${num(a / 1e3, 1)}k`;
  return `${sign}${eur(a)}`;
};

/** 12,3 % */
export const pct = (v: number | null | undefined, decimals = 1) => (v == null ? "n/a" : `${num(v, decimals)} %`);

/** "2026-08-12" or "2026-08-12 14:05" -> "12.08.2026" */
export const dateDk = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** "2026-09" -> "Sep 2026" */
export const monthLabel = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

/** "family_support" -> "Family support" */
export const label = (code: string) => code[0].toUpperCase() + code.slice(1).replace(/_/g, " ");

/** Signed change with a real minus sign: +3 / −2 / 0 */
export const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** Risk score band. 60 and above is shown as high risk (own assumption, docs/assumptions.md). */
export const HIGH_RISK = 60;
export const isHighRisk = (score: number) => score >= HIGH_RISK;
