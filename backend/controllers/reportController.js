const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const Attendance = require("../models/Attendance");
const Enquiry = require("../models/Enquiry");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const Equipment = require("../models/Equipment");
const User = require("../models/User");
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
    inside,
    todayCheckins,
    active,
    expired,
    exp7,
    trainers,
    newToday,
    enquiriesOpen,
    lowStock,
    serviceDue,
  ] = await Promise.all([
    collections(m, today, now, null),
    collections(m, monthStart, now, null),
    dueRows(m),
    Attendance.countDocuments({ ...m, checkoutAt: null }),
    Attendance.countDocuments({ ...m, checkinAt: { $gte: today } }),
    Membership.countDocuments({ ...m, status: "active" }),
    Membership.countDocuments({ ...m, status: "expired" }),
    Membership.countDocuments({
      ...m,
      status: "active",
      endDate: { $gte: now, $lte: addDays(now, 7) },
    }),
    User.countDocuments({ ...m, role: "trainer", status: "active" }),
    Member.countDocuments({ ...m, createdAt: { $gte: today } }),
    Enquiry.countDocuments({
      ...m,
      status: {
        $in: ["new", "contacted", "trial_booked", "trial_done", "negotiating"],
      },
    }),
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
  ]);
  res.json({
    success: true,
    data: {
      todayRevenue: r2(todayC[0]?.total),
      monthlyRevenue: r2(monthC[0]?.total),
      pendingPayments: r2(dues.reduce((s, d) => s + d.due, 0)),
      membersWithDues: dues.length,
      membersInsideGym: inside,
      todayCheckins,
      activeMemberships: active,
      expiredMemberships: expired,
      pendingRenewals: exp7,
      activeTrainers: trainers,
      newMembersToday: newToday,
      openEnquiries: enquiriesOpen,
      lowStockProducts: lowStock,
      equipmentServiceDue: serviceDue,
    },
  });
});

const getDashboardCharts = asyncHandler(async (req, res) => {
  const m = scope(req);
  const now = new Date();
  const from = istDayStart(addDays(now, -29));
  const [rev, att, growth] = await Promise.all([
    collections(m, from, now, {
      $dateToString: {
        format: "%Y-%m-%d",
        date: "$payments.paidAt",
        timezone: TZ,
      },
    }),
    Attendance.aggregate([
      { $match: { ...m, checkinAt: { $gte: from } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$checkinAt",
              timezone: TZ,
            },
          },
          n: { $sum: 1 },
        },
      },
    ]),
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
  ]);
  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(from.getTime() + i * DAY + 5.5 * 3600000)
      .toISOString()
      .slice(0, 10),
  );
  const revMap = new Map(rev.map((r) => [r._id, r.total]));
  const attMap = new Map(att.map((r) => [r._id, r.n]));
  const months = Array.from(
    { length: 12 },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - (11 - i), 1),
  );
  res.json({
    success: true,
    data: {
      revenueByDay: days.map((d) => ({ date: d, revenue: r2(revMap.get(d)) })),
      attendanceByDay: days.map((d) => ({
        date: d,
        count: attMap.get(d) || 0,
      })),
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
  const [
    byMethod,
    byKind,
    expenses,
    planSales,
    newMembers,
    enquiries,
    sources,
  ] = await Promise.all([
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
    Enquiry.aggregate([
      { $match: { ...m, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
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
  const enq = Object.fromEntries(enquiries.map((e) => [e._id, e.n]));
  const enqTotal = enquiries.reduce((s, e) => s + e.n, 0);
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
      enquiries: {
        total: enqTotal,
        converted: enq.converted || 0,
        lost: enq.lost || 0,
        conversionPercent: enqTotal
          ? Math.round(((enq.converted || 0) / enqTotal) * 100)
          : 0,
        byStatus: enq,
      },
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

// Paying members who stopped coming: the cheapest churn to prevent.
const atRisk = asyncHandler(async (req, res) => {
  const days = Math.min(60, Number(req.query.days) || 14);
  const m = scope(req);
  const since = addDays(new Date(), -days);
  const active = await Membership.find({
    ...m,
    status: "active",
    startDate: { $lte: addDays(new Date(), -days) },
  })
    .populate("memberId", "name phone memberCode")
    .lean();
  const ids = active.map((a) => a.memberId?._id).filter(Boolean);
  const recent = new Set(
    (
      await Attendance.distinct("memberId", {
        memberId: { $in: ids },
        checkinAt: { $gte: since },
      })
    ).map(String),
  );
  const last = await Attendance.aggregate([
    { $match: { memberId: { $in: ids } } },
    { $group: { _id: "$memberId", at: { $max: "$checkinAt" } } },
  ]);
  const lastMap = new Map(last.map((l) => [String(l._id), l.at]));
  const data = active
    .filter((a) => a.memberId && !recent.has(String(a.memberId._id)))
    .map((a) => ({
      member: a.memberId,
      plan: a.planName,
      endDate: a.endDate,
      lastVisit: lastMap.get(String(a.memberId._id)) || null,
      daysAbsent: lastMap.has(String(a.memberId._id))
        ? Math.floor((Date.now() - lastMap.get(String(a.memberId._id))) / DAY)
        : null,
    }))
    .sort((x, y) => (y.daysAbsent ?? 9999) - (x.daysAbsent ?? 9999));
  res.json({ success: true, count: data.length, data: data.slice(0, 200) });
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

// Footfall by hour and weekday → staffing and class timing decisions.
const heatmap = asyncHandler(async (req, res) => {
  const m = scope(req);
  const { from, to } = range(req, 30);
  const rows = await Attendance.aggregate([
    { $match: { ...m, checkinAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: {
          dow: { $dayOfWeek: { date: "$checkinAt", timezone: TZ } },
          hour: { $hour: { date: "$checkinAt", timezone: TZ } },
        },
        n: { $sum: 1 },
      },
    },
  ]);
  res.json({
    success: true,
    data: rows.map((r) => ({
      day: r._id.dow - 1,
      hour: r._id.hour,
      count: r.n,
    })),
  });
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

module.exports = {
  getDashboardSummary,
  getDashboardCharts,
  overview,
  dues,
  renewals,
  atRisk,
  birthdays,
  heatmap,
  gstRegister,
};
