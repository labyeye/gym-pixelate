const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const MemberAttendance = require("../models/MemberAttendance");
const Branch = require("../models/Branch");
const { churn, cohorts, ltv } = require("../utils/insights");
const { addDays, istDayStart } = require("../utils/gym");

const TZ = "Asia/Kolkata";
const oid = (v) => (v ? new mongoose.Types.ObjectId(String(v)) : null);
const top = (rows, n = 10) =>
  rows.sort((a, b) => b.value - a.value).slice(0, n);

function scope(req) {
  const m = {};
  if (req.user.tenantId) m.tenantId = oid(req.user.tenantId);
  if (req.query.branchId) m.branchId = oid(req.query.branchId);
  return m;
}
const payments = (m, from, groupBy) =>
  Invoice.aggregate([
    { $match: { ...m, status: { $ne: "cancelled" } } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: from } } },
    { $group: { _id: groupBy, value: { $sum: "$payments.amount" } } },
    { $sort: { _id: 1 } },
  ]);
const rows = (a) => a.map((r) => ({ label: String(r._id ?? "unknown"), value: r.value }));
const dateKey = (f) => ({
  $dateToString: { format: f, date: "$payments.paidAt", timezone: TZ },
});

const CATEGORIES = {
  async revenue(m) {
    const now = new Date();
    const [daily, monthly, method] = await Promise.all([
      payments(m, istDayStart(addDays(now, -29)), dateKey("%Y-%m-%d")),
      payments(m, new Date(now.getFullYear(), now.getMonth() - 11, 1), dateKey("%Y-%m")),
      payments(m, new Date(now.getFullYear(), now.getMonth() - 11, 1), "$payments.method"),
    ]);
    return { daily: rows(daily), monthly: rows(monthly), byMethod: rows(method) };
  },

  async members(m) {
    const since = new Date();
    since.setMonth(since.getMonth() - 11, 1);
    const live = { ...m, deletedAt: { $exists: false } };
    const g = (field) =>
      Member.aggregate([
        { $match: live },
        { $group: { _id: field, value: { $sum: 1 } } },
      ]);
    const [growth, gender, source, status, ages] = await Promise.all([
      Member.aggregate([
        { $match: { ...live, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: TZ } },
            value: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      g({ $ifNull: ["$gender", "unknown"] }),
      g({ $cond: [{ $in: ["$source", ["", null]] }, "unknown", "$source"] }),
      g("$status"),
      Member.find({ ...live, dob: { $exists: true } }).select("dob").lean(),
    ]);
    const bands = { "<18": 0, "18-25": 0, "26-35": 0, "36-45": 0, "46+": 0 };
    for (const { dob } of ages) {
      const a = (Date.now() - new Date(dob)) / 31557600000;
      bands[a < 18 ? "<18" : a <= 25 ? "18-25" : a <= 35 ? "26-35" : a <= 45 ? "36-45" : "46+"]++;
    }
    return {
      growth: rows(growth),
      gender: rows(gender),
      source: top(rows(source)),
      status: rows(status),
      ageBands: Object.entries(bands).map(([label, value]) => ({ label, value })),
    };
  },

  async plans(m) {
    const agg = await Membership.aggregate([
      { $match: { ...m, status: { $nin: ["cancelled", "upgraded"] } } },
      {
        $group: {
          _id: { $ifNull: ["$planName", "Unnamed"] },
          members: { $sum: 1 },
          revenue: { $sum: "$paidAmount" },
          renewals: { $sum: { $cond: ["$isRenewal", 1, 0] } },
        },
      },
      { $sort: { members: -1 } },
    ]);
    return {
      popularity: agg.map((r) => ({ label: r._id, value: r.members })),
      revenue: agg.map((r) => ({ label: r._id, value: r.revenue })),
      renewalMix: [
        { label: "Renewals", value: agg.reduce((n, r) => n + r.renewals, 0) },
        { label: "New joins", value: agg.reduce((n, r) => n + r.members - r.renewals, 0) },
      ],
    };
  },

  async retention(m) {
    const memberships = await Membership.find(m)
      .select("memberId startDate endDate status")
      .lean();
    const paid = await Invoice.aggregate([
      { $match: { ...m, status: { $ne: "cancelled" } } },
      { $unwind: "$payments" },
      { $group: { _id: null, total: { $sum: "$payments.amount" }, members: { $addToSet: "$memberId" } } },
    ]);
    return {
      churn: churn(memberships),
      cohorts: cohorts(memberships),
      ltv: ltv(memberships, paid[0]?.total || 0, paid[0]?.members.length || 0),
    };
  },

  async attendance(m) {
    const from = istDayStart(addDays(new Date(), -29));
    const list = await MemberAttendance.find({ ...m, date: { $gte: from } })
      .select("date checkIn verifyMode")
      .lean();
    const wd = Array(7).fill(0);
    const hr = Array(24).fill(0);
    const day = {};
    const mode = {};
    for (const a of list) {
      const d = new Date(new Date(a.date).getTime() + 5.5 * 3600000);
      wd[d.getUTCDay()]++;
      const k = d.toISOString().slice(0, 10);
      day[k] = (day[k] || 0) + 1;
      if (a.checkIn) hr[Number(a.checkIn.slice(0, 2))]++;
      mode[a.verifyMode || "manual"] = (mode[a.verifyMode || "manual"] || 0) + 1;
    }
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      total: list.length,
      byWeekday: names.map((label, i) => ({ label, value: wd[i] })),
      byHour: hr
        .map((value, h) => ({ label: `${h}:00`, value }))
        .filter((_, h) => h >= 4 && h <= 23),
      daily: Object.entries(day).sort().map(([label, value]) => ({ label, value })),
      byMode: Object.entries(mode).map(([label, value]) => ({ label, value })),
    };
  },

  async locations(m) {
    const tenant = m.tenantId ? { tenantId: m.tenantId } : {};
    const [branches, mem, rev, cities, pins] = await Promise.all([
      Branch.find(tenant).select("name city").lean(),
      Member.aggregate([
        { $match: { ...tenant, deletedAt: { $exists: false } } },
        { $group: { _id: "$branchId", value: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { ...tenant, status: { $ne: "cancelled" } } },
        { $unwind: "$payments" },
        { $group: { _id: "$branchId", value: { $sum: "$payments.amount" } } },
      ]),
      Member.aggregate([
        { $match: { ...m, deletedAt: { $exists: false }, city: { $nin: ["", null] } } },
        { $group: { _id: { $toLower: { $trim: { input: "$city" } } }, value: { $sum: 1 } } },
      ]),
      Member.aggregate([
        { $match: { ...m, deletedAt: { $exists: false }, pincode: { $nin: ["", null] } } },
        { $group: { _id: "$pincode", value: { $sum: 1 } } },
      ]),
    ]);
    const by = (a) => new Map(a.map((r) => [String(r._id), r.value]));
    const mm = by(mem);
    const rr = by(rev);
    return {
      branches: branches.map((b) => ({
        label: b.name + (b.city ? ` (${b.city})` : ""),
        members: mm.get(String(b._id)) || 0,
        revenue: rr.get(String(b._id)) || 0,
      })),
      cities: top(rows(cities)),
      pincodes: top(rows(pins)),
    };
  },
};

// One endpoint, one category at a time, so the page only pays for the tab being looked at.
const analytics = asyncHandler(async (req, res) => {
  const fn = CATEGORIES[req.query.category];
  if (!fn) {
    res.status(400);
    throw new Error(`category must be one of ${Object.keys(CATEGORIES).join(", ")}`);
  }
  res.json({ success: true, data: await fn(scope(req)) });
});

module.exports = { analytics };
