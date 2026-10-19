const Membership = require("../models/Membership");
const Attendance = require("../models/Attendance");
const Invoice = require("../models/Invoice");
const Enquiry = require("../models/Enquiry");
const Member = require("../models/Member");
const PTPackage = require("../models/PTPackage");
const FollowUp = require("../models/FollowUp");
const { DAY, r2, addDays } = require("./gym");

const DEFAULTS = {
  expiringDays: 14,
  lapsedDays: 30,
  atRiskDays: 14,
  duesGraceDays: 7,
  ptLowSessions: 2,
};

/**
 * Everything staff should chase today, one row per (person, reason). Pure reads.
 * Money is kept in two buckets that must never be added together or shown as revenue:
 *   pending   = already invoiced and unpaid (dues)
 *   projected = what a renewal would bring if the member says yes (last membership price)
 * `m` is the tenant/branch match (ObjectIds), `opts` overrides DEFAULTS, `now` is injectable for tests.
 */
async function buildOpportunities(m, opts = {}, now = new Date()) {
  const o = { ...DEFAULTS, ...opts };
  const items = [];
  const push = (type, who, extra) => items.push({ type, ...who, ...extra });

  // ---- renewals: expiring soon + recently lapsed, excluding anyone already holding a later membership
  const recent = await Membership.find({
    ...m,
    status: { $in: ["active", "expired"] },
    endDate: {
      $gte: addDays(now, -o.lapsedDays),
      $lte: addDays(now, o.expiringDays),
    },
  })
    .populate("memberId", "name phone memberCode status whatsappOptIn")
    .sort("endDate")
    .limit(1000)
    .lean();
  const ids = [
    ...new Set(
      recent.filter((r) => r.memberId).map((r) => String(r.memberId._id)),
    ),
  ];
  const later = await Membership.find({
    ...m,
    memberId: { $in: ids },
    status: { $in: ["active", "upcoming", "frozen"] },
    endDate: { $gt: addDays(now, o.expiringDays) },
  })
    .select("memberId")
    .lean();
  const covered = new Set(later.map((x) => String(x.memberId)));
  const seen = new Set();
  for (const r of recent) {
    const mem = r.memberId;
    if (
      !mem ||
      mem.status !== "active" ||
      covered.has(String(mem._id)) ||
      seen.has(String(mem._id))
    )
      continue;
    seen.add(String(mem._id));
    const left = Math.ceil((r.endDate - now) / DAY);
    const type = left >= 0 ? "renewal" : "lapsed";
    push(
      type,
      { member: mem },
      {
        key: `${type}:${mem._id}`,
        title:
          left >= 0
            ? `${r.planName || "Membership"} expires in ${left} day${left === 1 ? "" : "s"}`
            : `${r.planName || "Membership"} expired ${-left} day${left === -1 ? "" : "s"} ago`,
        daysLeft: left,
        plan: r.planName,
        endDate: r.endDate,
        priority: left >= 0 ? (left <= 3 ? 90 : 70) : Math.max(40, 60 + left),
        projected: r2(r.price || 0),
        membershipId: r._id,
      },
    );
  }

  // ---- dues: invoiced but unpaid, per member
  const dues = await Invoice.aggregate([
    {
      $match: {
        ...m,
        status: { $in: ["pending", "partial"] },
        memberId: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$memberId",
        due: { $sum: { $subtract: ["$totalAmount", "$paidAmount"] } },
        invoices: { $sum: 1 },
        oldest: { $min: "$issuedAt" },
      },
    },
    { $match: { due: { $gt: 0 } } },
  ]);
  if (dues.length) {
    const mems = new Map(
      (
        await Member.find({
          ...m,
          _id: { $in: dues.map((d) => d._id) },
          status: "active",
        })
          .select("name phone memberCode whatsappOptIn")
          .lean()
      ).map((x) => [String(x._id), x]),
    );
    for (const d of dues) {
      const mem = mems.get(String(d._id));
      if (!mem) continue;
      const age = Math.floor((now - d.oldest) / DAY);
      push(
        "dues",
        { member: mem },
        {
          key: `dues:${mem._id}`,
          title: `₹${r2(d.due)} unpaid across ${d.invoices} invoice${d.invoices === 1 ? "" : "s"} (oldest ${age}d)`,
          pending: r2(d.due),
          overdue: age > o.duesGraceDays,
          priority: age > o.duesGraceDays ? 80 : 50,
        },
      );
    }
  }

  // ---- at risk: paying, started a while ago, no visit in N days
  const active = await Membership.find({
    ...m,
    status: "active",
    startDate: { $lte: addDays(now, -o.atRiskDays) },
    endDate: { $gte: now },
  })
    .populate("memberId", "name phone memberCode status whatsappOptIn")
    .lean();
  const aIds = active.filter((a) => a.memberId).map((a) => a.memberId._id);
  if (aIds.length) {
    const lastVisit = new Map(
      (
        await Attendance.aggregate([
          { $match: { ...m, memberId: { $in: aIds } } },
          { $group: { _id: "$memberId", at: { $max: "$checkinAt" } } },
        ])
      ).map((x) => [String(x._id), x.at]),
    );
    const done = new Set();
    for (const a of active) {
      const mem = a.memberId;
      if (!mem || mem.status !== "active" || done.has(String(mem._id)))
        continue;
      const last = lastVisit.get(String(mem._id)) || null;
      const absent = last ? Math.floor((now - last) / DAY) : null;
      if (absent !== null && absent < o.atRiskDays) continue;
      done.add(String(mem._id));
      push(
        "at_risk",
        { member: mem },
        {
          key: `at_risk:${mem._id}`,
          title: last
            ? `No visit for ${absent} days`
            : "Joined but has never checked in",
          daysAbsent: absent,
          plan: a.planName,
          endDate: a.endDate,
          priority: Math.min(75, 45 + (absent ?? 30)),
        },
      );
    }
  }

  // ---- trials / negotiations not yet converted
  const trials = await Enquiry.find({
    ...m,
    status: { $in: ["trial_booked", "trial_done", "negotiating"] },
    convertedMemberId: null,
  })
    .sort("followUpAt")
    .limit(300)
    .lean();
  for (const e of trials) {
    const overdue = e.followUpAt && e.followUpAt < now;
    push(
      "trial",
      {
        enquiry: {
          _id: e._id,
          name: e.name,
          phone: e.phone,
          source: e.source,
          status: e.status,
        },
      },
      {
        key: `trial:${e._id}`,
        title:
          e.status === "trial_booked"
            ? "Trial booked — confirm attendance"
            : e.status === "trial_done"
              ? "Trial done — ask to join"
              : "Negotiating — close the sale",
        priority: overdue ? 85 : 55,
        followUpAt: e.followUpAt || null,
      },
    );
  }

  // ---- PT packages nearly used up
  const pts = await PTPackage.find({ ...m, status: "active" })
    .populate("memberId", "name phone memberCode status")
    .lean();
  for (const p of pts) {
    if (!p.memberId || p.memberId.status !== "active") continue;
    const used = (p.sessions || []).filter(
      (s) => s.status === "completed" || s.status === "missed",
    ).length;
    const left = Math.max(0, p.totalSessions - used);
    if (left > o.ptLowSessions) continue;
    push(
      "pt_renewal",
      { member: p.memberId },
      {
        key: `pt_renewal:${p._id}`,
        title: `${p.name}: ${left} session${left === 1 ? "" : "s"} left`,
        priority: 60,
        projected: r2(p.totalAmount || 0),
      },
    );
  }

  // ---- attach the latest follow-up of the same kind; hide snoozed / closed items
  const memberIds = items.filter((i) => i.member).map((i) => i.member._id);
  const enquiryIds = items.filter((i) => i.enquiry).map((i) => i.enquiry._id);
  const fus = await FollowUp.find({
    ...m,
    $or: [{ memberId: { $in: memberIds } }, { enquiryId: { $in: enquiryIds } }],
  })
    .sort("-createdAt")
    .limit(5000)
    .lean();
  const latest = new Map();
  for (const f of fus) {
    const k = `${f.memberId || f.enquiryId}:${f.kind}`;
    if (!latest.has(k)) latest.set(k, f);
  }
  for (const it of items) {
    const f = latest.get(`${(it.member || it.enquiry)._id}:${it.type}`);
    it.lastFollowUp = f
      ? {
          outcome: f.outcome,
          note: f.note,
          at: f.createdAt,
          by: f.byName,
          nextFollowUpAt: f.nextFollowUpAt,
        }
      : null;
    it.snoozed = !!(
      f &&
      ((f.nextFollowUpAt && f.nextFollowUpAt > now) ||
        f.outcome === "not_interested")
    );
  }
  items.sort((a, b) => b.priority - a.priority);
  return items;
}

function summarize(items) {
  const open = items.filter((i) => !i.snoozed);
  const byType = {};
  for (const i of open) byType[i.type] = (byType[i.type] || 0) + 1;
  return {
    open: open.length,
    snoozed: items.length - open.length,
    byType,
    pendingAmount: r2(open.reduce((s, i) => s + (i.pending || 0), 0)), // invoiced, unpaid
    projectedAmount: r2(open.reduce((s, i) => s + (i.projected || 0), 0)), // if renewals convert; NOT revenue
  };
}

module.exports = { buildOpportunities, summarize, DEFAULTS };
