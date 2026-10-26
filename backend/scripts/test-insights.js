// Pure-function check of churn / cohort / LTV maths:  node scripts/test-insights.js
const assert = require("assert");
const { churn, cohorts, ltv } = require("../utils/insights");

const now = new Date("2026-10-15T00:00:00Z");
const d = (s) => new Date(s + "T00:00:00Z");
const ms = (memberId, a, b, status = "expired") => ({ memberId, startDate: d(a), endDate: d(b), status });

const data = [
  ms("a", "2026-06-01", "2026-06-30"), // ends June, never returns -> lost
  ms("b", "2026-06-01", "2026-06-30"), // ends June ...
  ms("b", "2026-07-01", "2026-12-31", "active"), // ... and renews -> kept
  ms("c", "2026-09-20", "2026-10-05"), // ended in Oct, still in the 30-day window -> undecided, not counted
  ms("x", "2026-06-02", "2026-06-20", "cancelled"), // cancelled plans are ignored
];

const c = churn(data, now);
const june = c.find((r) => r.month === "2026-06");
assert.deepStrictEqual([june.ended, june.lost, june.churnPct], [2, 1, 50]);
assert.strictEqual(c.find((r) => r.month === "2026-10").ended, 0, "undecided members are not counted yet");

const co = cohorts(data, now);
const junec = co.find((r) => r.cohort === "2026-06");
assert.strictEqual(junec.size, 2);
assert.strictEqual(junec.retained[0], 50, "1 July: only b is live");
assert.strictEqual(junec.retained[1], 50, "1 August: only b");

const l = ltv([ms("a", "2026-01-01", "2026-01-31"), ms("a", "2026-02-01", "2026-03-02")], 3000, 1);
assert.strictEqual(l.avgLifetimeMonths, 2);
assert(Math.abs(l.ltv - 3000) <= 5, "one member, Rs 3000 over ~2 months of plans");
console.log("INSIGHTS OK");
