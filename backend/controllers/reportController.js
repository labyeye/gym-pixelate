const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const Equipment = require("../models/Equipment");
const User = require("../models/User");
const TrainerAssignment = require("../models/TrainerAssignment");
const Feedback = require("../models/Feedback");
const { churn, cohorts, ltv } = require("../utils/insights");
const { r2, addDays, istDayStart, istDay, DAY } = require("../utils/gym");

const oid = (v) => (v ? new mongoose.Types.ObjectId(String(v)) : null);
const TZ = "Asia/Kolkata";

function scope(req) {
  const m = {};
  if (req.user.tenantId) m.tenantId = oid(req.user.tenantId);
  if (req.query.branchId) m.branchId = oid(req.query.branchId);
  return m;
}
function range(req, defDays = 30) {
  const to = req.query.to ? istDay(req.query.to, true) : new Date();
  const from = req.query.from
    ? istDay(req.query.from)
    : istDayStart(addDays(to, -(defDays - 1)));
  return { from, to };
}

/** Net money collected in [from,to] straight from the payment ledger (refunds are negative rows). */
const collections = (m, from, to, groupBy = "$payments.method") =>
  Invoice.aggregate([
    { $match: { ...m, status: { $ne: "cancelled" } } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: from, $lte: to } } },
    {
      $group: {
        _id: groupBy,
        total: { $sum: "$payments.amount" },
        count: { $sum: 1 },
      },
    },
  ]);

const dueRows = (m) =>
  Invoice.aggregate([
    { $match: { ...m, status: { $in: ["pending", "partial"] } } },
    {
      $group: {
        _id: "$memberId",
        due: { $sum: { $subtract: ["$totalAmount", "$paidAmount"] } },
        invoices: { $sum: 1 },
        oldest: { $min: "$issuedAt" },
      },
    },
    { $sort: { due: -1 } },
  ]);

const getDashboardSummary = asyncHandler(async (req, res) => {
  const m = scope(req);
  const now = new Date();
  const today = istDayStart(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [
    todayC,
    monthC,
    dues,
    active,
    expired,
    exp7,
    trainers,
    newToday,
    lowStock,
    serviceDue,
    totalMembers,
    frozen,
    renewedMonth,
    newMonth,
    recentRenewals,
    newMembersList,
    planMix,
    recentCollections,
    recentPos,
    recentMemberships,
  ] = await Promise.all([
    collections(m, today, now, null),
    collections(m, monthStart, now, null),
    dueRows(m),
    Membership.countDocuments({ ...m, status: "active" }),
    Membership.countDocuments({ ...m, status: "expired" }),
    Membership.countDocuments({
      ...m,
      status: "active",
      endDate: { $gte: now, $lte: addDays(now, 7) },
    }),
    User.countDocuments({ ...m, role: "trainer", status: "active" }),
    Member.countDocuments({ ...m, createdAt: { $gte: today } }),
    Product.countDocuments({
      ...m,
      isActive: true,
      $expr: { $lte: ["$stock", "$reorderLevel"] },
    }),
    Equipment.countDocuments({
      ...m,
      nextServiceOn: { $lte: addDays(now, 7) },
      status: { $ne: "retired" },
    }),
    Member.countDocuments(m),
    Membership.countDocuments({ ...m, status: "frozen" }),
    Membership.countDocuments({
      ...m,
      isRenewal: true,
      createdAt: { $gte: monthStart },
      status: { $ne: "cancelled" },
    }),
    Member.countDocuments({ ...m, createdAt: { $gte: monthStart } }),
    Membership.find({ ...m, isRenewal: true, status: { $ne: "cancelled" } })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("planName totalAmount createdAt memberId")
      .populate("memberId", "name")
      .lean(),
    Member.find({ ...m, createdAt: { $gte: monthStart } })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("name phone createdAt")
      .lean(),
    Membership.aggregate([
      { $match: { ...m, status: "active" } },
      {
        $group: {
          _id: "$planName",
          members: { $sum: 1 },
          billed: { $sum: "$totalAmount" },
        },
      },
      { $sort: { members: -1 } },
      { $limit: 6 },
    ]),
    Invoice.aggregate([
      { $match: { ...m, status: { $ne: "cancelled" } } },
      { $unwind: "$payments" },
      { $match: { "payments.amount": { $gt: 0 } } },
      { $sort: { "payments.paidAt": -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "members",
          localField: "memberId",
          foreignField: "_id",
          as: "mem",
        },
      },
      {
        $project: {
          amount: "$payments.amount",
          method: "$payments.method",
          at: "$payments.paidAt",
          name: { $arrayElemAt: ["$mem.name", 0] },
        },
      },
    ]),
    Invoice.aggregate([
      {
        $match: {
          ...m,
          status: { $nin: ["cancelled", "refunded"] },
          "items.kind": "product",
        },
      },
      { $sort: { issuedAt: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "members",
          localField: "memberId",
          foreignField: "_id",
          as: "mem",
        },
      },
      {
        $project: {
          amount: "$totalAmount",
          at: "$issuedAt",
          name: { $arrayElemAt: ["$mem.name", 0] },
          number: "$invoiceNumber",
        },
      },
    ]),
    Membership.find({ ...m, status: { $ne: "cancelled" } })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("planName totalAmount createdAt memberId")
      .populate("memberId", "name")
      .lean(),
  ]);
  res.json({
    success: true,
    data: {
      todayRevenue: r2(todayC[0]?.total),
      monthlyRevenue: r2(monthC[0]?.total),
      pendingPayments: r2(dues.reduce((s, d) => s + d.due, 0)),
      membersWithDues: dues.length,
      activeMemberships: active,
      expiredMemberships: expired,
      pendingRenewals: exp7,
      activeTrainers: trainers,
      newMembersToday: newToday,
      lowStockProducts: lowStock,
      equipmentServiceDue: serviceDue,
      totalMembers,
      frozenMemberships: frozen,
      renewedThisMonth: renewedMonth,
      newMembersThisMonth: newMonth,
      recentRenewals,
      newMembersList,
      recentCollections,
      recentPos,
      recentMemberships,
      planMix: planMix.map((p) => ({
        plan: p._id || "—",
        members: p.members,
        billed: r2(p.billed),
      })),
    },
  });
});

const getDashboardCharts = asyncHandler(async (req, res) => {
  const m = scope(req);
  const now = new Date();
  const from = istDayStart(addDays(now, -29));
  const m12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const posAgg = (fmt, since) =>
    Invoice.aggregate([
      {
        $match: {
          ...m,
          status: { $nin: ["cancelled", "refunded"] },
          issuedAt: { $gte: since },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.kind": "product" } },
      {
        $group: {
          _id: {
            $dateToString: { format: fmt, date: "$issuedAt", timezone: TZ },
          },
          total: {
            $sum: {
              $multiply: [
                "$items.amount",
                {
                  $add: [
                    1,
                    { $divide: [{ $ifNull: ["$items.gstPercent", 0] }, 100] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]);
  const [rev, growth, revMonthAgg, posDayAgg, posMonthAgg, memDayAgg] =
    await Promise.all([
      collections(m, from, now, {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$payments.paidAt",
          timezone: TZ,
        },
      }),
      Membership.aggregate([
        {
          $match: {
            ...m,
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1),
            },
          },
        },
        {
          $group: {
            _id: {
              y: { $year: { date: "$createdAt", timezone: TZ } },
              mo: { $month: { date: "$createdAt", timezone: TZ } },
            },
            n: { $sum: 1 },
          },
        },
      ]),
      collections(m, m12, now, {
        $dateToString: {
          format: "%Y-%m",
          date: "$payments.paidAt",
          timezone: TZ,
        },
      }),
      posAgg("%Y-%m-%d", from),
      posAgg("%Y-%m", m12),
      Membership.aggregate([
        { $match: { ...m, createdAt: { $gte: from } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: TZ,
              },
            },
            n: { $sum: 1 },
          },
        },
      ]),
    ]);
  const mk = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const mapOf = (a, k) => new Map(a.map((x) => [x._id, x[k]]));
  const revM = mapOf(revMonthAgg, "total");
  const posD = mapOf(posDayAgg, "total");
  const posM = mapOf(posMonthAgg, "total");
  const memD = mapOf(memDayAgg, "n");
  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(from.getTime() + i * DAY + 5.5 * 3600000)
      .toISOString()
      .slice(0, 10),
  );
  const revMap = new Map(rev.map((r) => [r._id, r.total]));
  const months = Array.from(
    { length: 12 },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - (11 - i), 1),
  );
  res.json({
    success: true,
    data: {
      revenueByDay: days.map((d) => ({ date: d, revenue: r2(revMap.get(d)) })),
      revenueByMonth: months.map((d) => ({
        month: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
        revenue: r2(revM.get(mk(d))),
      })),
      posByDay: days.map((d) => ({ date: d, revenue: r2(posD.get(d)) })),
      posByMonth: months.map((d) => ({
        month: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
        revenue: r2(posM.get(mk(d))),
      })),
      membersByDay: days.map((d) => ({ date: d, count: memD.get(d) || 0 })),
      membershipGrowth: months.map((d) => ({
        month: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
        newMemberships:
          growth.find(
            (g) => g._id.y === d.getFullYear() && g._id.mo === d.getMonth() + 1,
          )?.n || 0,
      })),
    },
  });
});

// Owner's P&L + the numbers behind "how is the gym doing".
const overview = asyncHandler(async (req, res) => {
  const m = scope(req);
  const { from, to } = range(req);
  const [byMethod, byKind, expenses, planSales, newMembers, sources] =
    await Promise.all([
      collections(m, from, to),
      Invoice.aggregate([
        {
          $match: {
            ...m,
            status: { $nin: ["cancelled"] },
            issuedAt: { $gte: from, $lte: to },
          },
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.kind",
            amount: { $sum: "$items.amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Expense.aggregate([
        { $match: { ...m, paidOn: { $gte: from, $lte: to } } },
        { $group: { _id: "$category", total: { $sum: "$amount" } } },
      ]),
      Membership.aggregate([
        {
          $match: {
            ...m,
            createdAt: { $gte: from, $lte: to },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: "$planName",
            sold: { $sum: 1 },
            billed: { $sum: "$totalAmount" },
            renewals: { $sum: { $cond: ["$isRenewal", 1, 0] } },
          },
        },
        { $sort: { billed: -1 } },
      ]),
      Member.countDocuments({ ...m, createdAt: { $gte: from, $lte: to } }),
      Member.aggregate([
        { $match: { ...m, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $ifNull: ["$source", ""] }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
    ]);

  // retention: of memberships that ended in the window, how many members are still covered afterwards?
  const ended = await Membership.find({
    ...m,
    endDate: { $gte: from, $lte: to },
    status: { $in: ["active", "expired"] },
  })
    .select("memberId")
    .lean();
  const endedIds = [...new Set(ended.map((e) => String(e.memberId)))];
  const stillIn = endedIds.length
    ? await Membership.distinct("memberId", {
        memberId: { $in: endedIds.map(oid) },
        status: { $in: ["active", "frozen", "upcoming"] },
        endDate: { $gt: to },
      })
    : [];
  const retention = endedIds.length
    ? Math.round((stillIn.length / endedIds.length) * 100)
    : null;

  const income = r2(byMethod.reduce((s, r) => s + r.total, 0));
  const spend = r2(expenses.reduce((s, r) => s + r.total, 0));
  res.json({
    success: true,
    data: {
      range: { from, to },
      income,
      expenses: spend,
      profit: r2(income - spend),
      byMethod: byMethod.map((r) => ({
        method: r._id,
        total: r2(r.total),
        count: r.count,
      })),
      byKind: byKind.map((r) => ({
        kind: r._id,
        amount: r2(r.amount),
        count: r.count,
      })),
      expenseByCategory: expenses
        .map((r) => ({ category: r._id, total: r2(r.total) }))
        .sort((a, b) => b.total - a.total),
      planSales: planSales.map((p) => ({
        plan: p._id,
        sold: p.sold,
        renewals: p.renewals,
        billed: r2(p.billed),
      })),
      newMembers,
      retentionPercent: retention,
      membersUpForRenewal: endedIds.length,
      sources: sources.map((s) => ({ source: s._id || "unknown", count: s.n })),
    },
  });
});

const dues = asyncHandler(async (req, res) => {
  const rows = await dueRows(scope(req));
  const members = await Member.find({
    _id: { $in: rows.map((r) => r._id).filter(Boolean) },
  })
    .select("name phone memberCode")
    .lean();
  const byId = new Map(members.map((x) => [String(x._id), x]));
  const data = rows
    .filter((r) => r._id)
    .map((r) => ({
      member: byId.get(String(r._id)),
      due: r2(r.due),
      invoices: r.invoices,
      oldest: r.oldest,
      daysOverdue: Math.floor((Date.now() - r.oldest) / DAY),
    }));
  res.json({
    success: true,
    total: r2(rows.reduce((s, r) => s + r.due, 0)),
    count: data.length,
    data,
  });
});

// Renewal worklist: who to call this week (phone + wa.me link ready for the desk).
const renewals = asyncHandler(async (req, res) => {
  const days = Math.min(90, Number(req.query.days) || 7);
  const m = scope(req);
  const now = new Date();
  const lapsedSince = addDays(now, -(Number(req.query.lapsedDays) || 15));
  const rows = await Membership.find({
    ...m,
    status: { $in: ["active", "expired"] },
    endDate: {
      $gte: req.query.includeLapsed === "false" ? now : lapsedSince,
      $lte: addDays(now, days),
    },
  })
    .populate("memberId", "name phone memberCode whatsappOptIn")
    .sort("endDate")
    .limit(500)
    .lean();
  // skip anyone who already renewed (has a later membership)
  const ids = rows.map((r) => r.memberId?._id).filter(Boolean);
  const later = await Membership.find({
    memberId: { $in: ids },
    status: { $in: ["active", "upcoming", "frozen"] },
    endDate: { $gt: addDays(now, days) },
  })
    .select("memberId")
    .lean();
  const renewed = new Set(later.map((x) => String(x.memberId)));
  const data = rows
    .filter((r) => r.memberId && !renewed.has(String(r.memberId._id)))
    .map((r) => {
      const left = Math.ceil((r.endDate - now) / DAY);
      const phone = String(r.memberId.phone || "").replace(/\D/g, "");
      const text = encodeURIComponent(
        `Hi ${r.memberId.name}, your ${r.planName || "gym"} membership ${left < 0 ? `expired ${-left} day(s) ago` : `expires in ${left} day(s)`}. Renew today to keep your streak going!`,
      );
      return {
        membershipId: r._id,
        member: r.memberId,
        plan: r.planName,
        endDate: r.endDate,
        daysLeft: left,
        due: r2(r.totalAmount - r.paidAmount),
        whatsapp: phone
          ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${text}`
          : null,
      };
    });
  res.json({ success: true, count: data.length, data });
});

const birthdays = asyncHandler(async (req, res) => {
  const m = scope(req);
  const mon = Number(req.query.month) || new Date().getMonth() + 1;
  const data = await Member.aggregate([
    { $match: { ...m, status: "active", dob: { $ne: null } } },
    { $addFields: { mo: { $month: "$dob" }, day: { $dayOfMonth: "$dob" } } },
    { $match: { mo: mon } },
    { $sort: { day: 1 } },
    { $project: { name: 1, phone: 1, memberCode: 1, dob: 1, day: 1 } },
  ]);
  res.json({ success: true, count: data.length, data });
});

const GST_FIELDS = {
  gstAmount: 1,
  totalAmount: 1,
  amount: 1,
  invoiceNumber: 1,
  issuedAt: 1,
  status: 1,
  memberId: 1,
};
// GST sales register for the CA: taxable value + tax per invoice, with monthly totals.
const gstRegister = asyncHandler(async (req, res) => {
  const m = scope(req);
  const { from, to } = range(req, 30);
  const data = await Invoice.find(
    {
      ...m,
      status: { $nin: ["cancelled"] },
      issuedAt: { $gte: from, $lte: to },
    },
    GST_FIELDS,
  )
    .populate("memberId", "name")
    .sort("issuedAt")
    .lean();
  const sum = (k) => r2(data.reduce((s, i) => s + (i[k] || 0), 0));
  res.json({
    success: true,
    data,
    totals: {
      taxable: sum("amount"),
      gst: sum("gstAmount"),
      total: sum("totalAmount"),
      cgst: r2(sum("gstAmount") / 2),
      sgst: r2(sum("gstAmount") / 2),
    },
  });
});

// Churn, cohort retention, LTV and trainer load (maths in utils/insights.js).
const insights = asyncHandler(async (req, res) => {
  const m = scope(req);
  const since = new Date();
  since.setMonth(since.getMonth() - 18);
  const [memberships, paid, trainers, loads, ratings] = await Promise.all([
    Membership.find(m).select("memberId startDate endDate status").lean(),
    Invoice.aggregate([
      { $match: { ...m, status: { $ne: "cancelled" } } },
      { $unwind: "$payments" },
      {
        $group: {
          _id: null,
          total: { $sum: "$payments.amount" },
          members: { $addToSet: "$memberId" },
        },
      },
    ]),
    User.find({
      ...(m.tenantId && { tenantId: m.tenantId }),
      role: "trainer",
      status: "active",
    })
      .select("name trainerProfile.maxClients")
      .lean(),
    TrainerAssignment.aggregate([
      { $match: { ...m, isActive: true } },
      { $group: { _id: "$trainerId", clients: { $sum: 1 } } },
    ]),
    Feedback.find({
      ...m,
      createdAt: { $gte: new Date(Date.now() - 90 * DAY) },
    })
      .sort("-createdAt")
      .limit(200)
      .populate("memberId", "name")
      .lean(),
  ]);
  const promoters = ratings.filter((r) => r.score >= 9).length;
  const detractors = ratings.filter((r) => r.score <= 6).length;
  const load = Object.fromEntries(loads.map((l) => [String(l._id), l.clients]));
  const now = new Date();
  res.json({
    success: true,
    data: {
      nps: {
        responses: ratings.length,
        score: ratings.length
          ? Math.round(((promoters - detractors) / ratings.length) * 100)
          : null,
        recent: ratings
          .filter((r) => r.comment)
          .slice(0, 10)
          .map((r) => ({
            name: r.memberId?.name,
            score: r.score,
            comment: r.comment,
            at: r.createdAt,
          })),
      },
      churn: churn(memberships, now),
      cohorts: cohorts(memberships, now),
      ltv: ltv(
        memberships,
        paid[0]?.total || 0,
        (paid[0]?.members || []).filter(Boolean).length,
      ),
      trainers: trainers.map((t) => {
        const max = t.trainerProfile?.maxClients || 0;
        const clients = load[String(t._id)] || 0;
        return {
          _id: t._id,
          name: t.name,
          clients,
          maxClients: max,
          utilisationPct: max ? Math.round((clients / max) * 100) : null,
        };
      }),
    },
  });
});

// Custom report builder: subject x up to 2 group-by dimensions x equality filters.
// Everything is whitelisted below; the client only ever sends keys, never field names.
const mon = (f) => ({
  $dateToString: { format: "%Y-%m", date: f, timezone: TZ },
});
const day = (f) => ({
  $dateToString: { format: "%Y-%m-%d", date: f, timezone: TZ },
});
const SUBJECTS = {
  collections: {
    model: Invoice,
    date: "$payments.paidAt",
    sum: "$payments.amount",
    sumLabel: "Collected",
    pre: [
      { $match: { status: { $ne: "cancelled" } } },
      { $unwind: "$payments" },
    ],
    dims: {
      method: "$payments.method",
      invoiceStatus: "$status",
      month: mon("$payments.paidAt"),
      day: day("$payments.paidAt"),
      receivedBy: "$payments.receivedBy",
    },
  },
  invoices: {
    model: Invoice,
    date: "$issuedAt",
    sum: "$totalAmount",
    sumLabel: "Billed",
    pre: [{ $match: { status: { $ne: "cancelled" } } }],
    dims: { status: "$status", month: mon("$issuedAt"), day: day("$issuedAt") },
  },
  memberships: {
    model: Membership,
    date: "$createdAt",
    sum: "$totalAmount",
    sumLabel: "Billed",
    pre: [{ $match: { status: { $ne: "cancelled" } } }],
    dims: {
      plan: "$planName",
      status: "$status",
      renewal: { $cond: ["$isRenewal", "renewal", "new"] },
      coupon: { $ifNull: ["$couponCode", ""] },
      soldBy: "$soldBy",
      month: mon("$createdAt"),
      day: day("$createdAt"),
    },
  },
  members: {
    model: Member,
    date: "$createdAt",
    sum: null,
    sumLabel: "",
    pre: [{ $match: { deletedAt: null } }],
    dims: {
      source: "$source",
      gender: "$gender",
      status: "$status",
      goal: "$fitness.goal",
      slot: "$fitness.preferredSlot",
      level: "$fitness.level",
      city: "$city",
      month: mon("$createdAt"),
    },
  },
  expenses: {
    model: Expense,
    date: "$paidOn",
    sum: "$amount",
    sumLabel: "Spent",
    pre: [],
    dims: {
      category: "$category",
      method: "$method",
      vendor: { $ifNull: ["$vendor", ""] },
      month: mon("$paidOn"),
      day: day("$paidOn"),
    },
  },
};
const customMeta = (req, res) =>
  res.json({
    success: true,
    data: Object.fromEntries(
      Object.entries(SUBJECTS).map(([k, s]) => [
        k,
        { dims: Object.keys(s.dims), sumLabel: s.sumLabel },
      ]),
    ),
  });

const custom = asyncHandler(async (req, res) => {
  const s = SUBJECTS[req.query.subject];
  if (!s) {
    res.status(400);
    throw new Error("Unknown subject");
  }
  const keys = String(req.query.groupBy || "")
    .split(",")
    .filter(Boolean)
    .slice(0, 2);
  if (keys.some((k) => !s.dims[k])) {
    res.status(400);
    throw new Error("Unknown group-by");
  }
  let filters = {};
  try {
    filters = JSON.parse(req.query.filters || "{}");
  } catch {
    /* ignore bad json */
  }
  const eq = Object.entries(filters)
    .filter(([k, v]) => s.dims[k] && v !== "" && v != null)
    .map(([k, v]) => ({ $expr: { $eq: [s.dims[k], String(v)] } }));
  const { from, to } = range(req);
  const rows = await s.model.aggregate([
    { $match: scope(req) },
    ...s.pre,
    {
      $match: {
        $expr: { $and: [{ $gte: [s.date, from] }, { $lte: [s.date, to] }] },
      },
    },
    ...(eq.length ? [{ $match: { $and: eq } }] : []),
    {
      $group: {
        _id: Object.fromEntries(keys.map((k, i) => [`k${i}`, s.dims[k]])),
        count: { $sum: 1 },
        total: s.sum ? { $sum: s.sum } : { $sum: 0 },
      },
    },
    { $sort: { total: -1, count: -1 } },
    { $limit: 500 },
  ]);
  const data = rows.map((r) => ({
    keys: keys.map((_, i) => String(r._id[`k${i}`] ?? "") || "unknown"),
    count: r.count,
    total: r2(r.total),
  }));
  res.json({
    success: true,
    groupBy: keys,
    sumLabel: s.sumLabel,
    data,
    totals: {
      count: data.reduce((a, r) => a + r.count, 0),
      total: r2(data.reduce((a, r) => a + r.total, 0)),
    },
  });
});

const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });

// Daily transaction ledger: every payment received (income) and every expense, with per-day totals.
// ?type=income|expense narrows it; ?method=upi etc filters both sides.
const transactions = asyncHandler(async (req, res) => {
  const m = scope(req);
  const { from, to } = range(req, 1);
  const { type, method } = req.query;
  const inRange = (d) => d >= from && d <= to;
  const rows = [];
  if (type !== "expense") {
    const inv = await Invoice.find({
      ...m,
      status: { $ne: "cancelled" },
      "payments.paidAt": { $gte: from, $lte: to },
    })
      .select("invoiceNumber memberId payments")
      .populate("memberId", "name")
      .lean();
    for (const i of inv)
      for (const p of i.payments)
        if (inRange(p.paidAt) && (!method || p.method === method))
          rows.push({
            at: p.paidAt,
            type: "income",
            ref: i.invoiceNumber,
            party: i.memberId?.name || "Walk-in",
            method: p.method,
            amount: p.amount,
          });
  }
  if (type !== "income") {
    const exp = await Expense.find({
      ...m,
      paidOn: { $gte: from, $lte: to },
      ...(method && { method }),
    }).lean();
    for (const e of exp)
      rows.push({
        at: e.paidOn,
        type: "expense",
        ref: e.category,
        party: e.vendor || e.description || "",
        method: e.method,
        amount: e.amount,
      });
  }
  rows.sort((a, b) => a.at - b.at);
  const days = {};
  for (const r of rows) {
    const d = (days[dayKey(r.at)] ||= {
      day: dayKey(r.at),
      income: 0,
      expense: 0,
    });
    d[r.type] += r.amount;
  }
  const dayRows = Object.values(days).map((d) => ({
    ...d,
    income: r2(d.income),
    expense: r2(d.expense),
    net: r2(d.income - d.expense),
  }));
  const income = r2(dayRows.reduce((s, d) => s + d.income, 0));
  const expense = r2(dayRows.reduce((s, d) => s + d.expense, 0));
  res.json({
    success: true,
    data: rows,
    days: dayRows,
    totals: { income, expense, net: r2(income - expense) },
  });
});

// Members who joined in the range (today / yesterday / any window), with their latest plan.
const newMembers = asyncHandler(async (req, res) => {
  const m = scope(req);
  const { from, to } = range(req, 1);
  const q = { ...m, deletedAt: null, createdAt: { $gte: from, $lte: to } };
  if (req.query.source) q.source = req.query.source;
  if (req.query.gender) q.gender = req.query.gender;
  const members = await Member.find(q)
    .select("name phone memberCode source gender createdAt")
    .sort("-createdAt")
    .limit(1000)
    .lean();
  const ms = await Membership.find({
    memberId: { $in: members.map((x) => x._id) },
    status: { $ne: "cancelled" },
  })
    .select("memberId planName createdAt")
    .sort("createdAt")
    .lean();
  const plan = Object.fromEntries(
    ms.map((x) => [String(x.memberId), x.planName]),
  );
  const data = members.map((x) => ({ ...x, plan: plan[String(x._id)] || "" }));
  res.json({ success: true, count: data.length, data });
});

module.exports = {
  transactions,
  newMembers,
  custom,
  customMeta,
  insights,
  getDashboardSummary,
  getDashboardCharts,
  overview,
  dues,
  renewals,
  birthdays,
  gstRegister,
};
