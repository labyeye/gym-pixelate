// Churn, cohort retention and lifetime value from a gym's memberships. Pure functions (no DB) so they can be tested.
// memberships: [{ memberId, startDate, endDate, status }]
const DAY = 86400000;
const ym = (d) => new Date(d).toISOString().slice(0, 7);
const monthStart = (d, plus = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + plus, 1));
const counts = (m) => !["cancelled", "upgraded"].includes(m.status);

function byMember(memberships) {
  const map = new Map();
  for (const m of memberships.filter(counts)) {
    const k = String(m.memberId);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ s: new Date(m.startDate), e: new Date(m.endDate) });
  }
  return map;
}
const activeAt = (list, at) => list.some((x) => x.s <= at && x.e >= at);

/** Per month (last `months`): members whose plan ended that month, how many did not come back within 30 days. */
function churn(memberships, now = new Date(), months = 6) {
  const map = byMember(memberships);
  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const from = monthStart(now, -i);
    const to = monthStart(now, -i + 1);
    let ended = 0;
    let lost = 0;
    for (const list of map.values()) {
      const last = list.filter((x) => x.e >= from && x.e < to).sort((a, b) => b.e - a.e)[0];
      if (!last) continue;
      ended++;
      const back = list.some((x) => x.s > last.s && x.e > last.e && x.s.getTime() <= last.e.getTime() + 30 * DAY);
      if (!back && last.e.getTime() + 30 * DAY <= now.getTime()) lost++;
      else if (!back) ended--; // still inside the 30-day grace window, undecided
    }
    rows.push({ month: ym(from), ended, lost, churnPct: ended ? Math.round((lost / ended) * 1000) / 10 : 0 });
  }
  return rows;
}

/** Cohort = month of a member's first plan. Row i, column k = % of the cohort with a live plan k months later. */
function cohorts(memberships, now = new Date(), months = 6) {
  const map = byMember(memberships);
  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const from = monthStart(now, -i);
    const to = monthStart(now, -i + 1);
    const members = [...map.values()].filter((list) => {
      const first = list.reduce((a, x) => (x.s < a ? x.s : a), list[0].s);
      return first >= from && first < to;
    });
    const retained = [];
    for (let k = 0; k <= i; k++) {
      const probe = new Date(Math.min(monthStart(now, -i + k + 1).getTime(), now.getTime())); // start of the month after month k
      retained.push(members.length ? Math.round((members.filter((l) => activeAt(l, probe)).length / members.length) * 100) : 0);
    }
    rows.push({ cohort: ym(from), size: members.length, retained });
  }
  return rows;
}

/** LTV = average monthly revenue per member x average months a member stays. */
function ltv(memberships, collected, payingMembers) {
  const map = byMember(memberships);
  let months = 0;
  for (const list of map.values()) months += list.reduce((n, x) => n + (x.e - x.s) / DAY / 30, 0);
  const avgMonths = map.size ? months / map.size : 0;
  const perMemberMonth = months ? collected / months : 0;
  return {
    avgLifetimeMonths: Math.round(avgMonths * 10) / 10,
    revenuePerMemberMonth: Math.round(perMemberMonth),
    ltv: Math.round(perMemberMonth * avgMonths),
    revenuePerMember: payingMembers ? Math.round(collected / payingMembers) : 0,
  };
}

module.exports = { churn, cohorts, ltv };
