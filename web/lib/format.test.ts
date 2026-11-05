// Run: npm test   (Node runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateDk, eur, eurShort, isHighRisk, label, monthLabel, pct, signed } from "./format.ts";

test("European number and date formats", () => {
  assert.equal(eur(9450.3), "€9.450");
  assert.equal(eurShort(1234), "€1,2k");
  assert.equal(eurShort(2345678), "€2,3m");
  assert.equal(eurShort(950), "€950");
  assert.equal(eurShort(-3000), "−€3,0k");
  assert.equal(pct(92.34), "92,3 %");
  assert.equal(pct(null), "n/a");
  assert.equal(dateDk("2026-12-31 14:05"), "31.12.2026");
  assert.equal(monthLabel("2026-09"), "Sep 2026");
  assert.equal(label("family_support"), "Family support");
  assert.equal(signed(-2), "−2");
  assert.equal(isHighRisk(60), true);
  assert.equal(isHighRisk(59), false);
});
