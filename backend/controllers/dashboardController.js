const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const Invoice = require("../models/Invoice");
const User = require("../models/User");

const getDashboardSummary = asyncHandler(async (req, res) => {
  const tf = req.user.tenantId ? { tenantId: req.user.tenantId } : {};
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const [
    todayRevenueAgg,
    activeMemberships,
    expiredMemberships,
    pendingRenewals,
    monthlyRevenueAgg,
    pendingPaymentsAgg,
    activeTrainers,
  ] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          ...tf,
          status: "paid",
          issuedAt: { $gte: todayStart, $lte: todayEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    Membership.countDocuments({ ...tf, status: "active" }),
    Membership.countDocuments({ ...tf, status: "expired" }),
    Membership.countDocuments({
      ...tf,
      status: "active",
      endDate: { $gte: now, $lte: in7Days },
    }),
    Invoice.aggregate([
      {
        $match: { ...tf, status: "paid", issuedAt: { $gte: startOfMonth } },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    Invoice.aggregate([
      { $match: { ...tf, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    User.countDocuments({ ...tf, role: "trainer", status: "active" }),
  ]);

  res.json({
    success: true,
    data: {
      todayRevenue: todayRevenueAgg[0]?.total || 0,
      activeMemberships,
      expiredMemberships,
      pendingRenewals,
      monthlyRevenue: monthlyRevenueAgg[0]?.total || 0,
      pendingPayments: pendingPaymentsAgg[0]?.total || 0,
      activeTrainers,
    },
  });
});

const getDashboardCharts = asyncHandler(async (req, res) => {
  const tf = req.user.tenantId ? { tenantId: req.user.tenantId } : {};
  const now = new Date();

  const days30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    return { dayStart: d, dayEnd };
  });

  const [revenueByDay] = await Promise.all([
    Promise.all(
      days30.map(({ dayStart, dayEnd }) =>
        Invoice.aggregate([
          {
            $match: {
              ...tf,
              status: "paid",
              issuedAt: { $gte: dayStart, $lte: dayEnd },
            },
          },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
      ),
    ),
  ]);

  const revenueByDayData = days30.map(({ dayStart }, i) => ({
    date: dayStart.toISOString().slice(0, 10),
    revenue: revenueByDay[i][0]?.total || 0,
  }));

  const months12 = Array.from({ length: 12 }, (_, i) => {
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth() - (11 - i),
      1,
    );
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() - (11 - i) + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const monthName = monthStart.toLocaleString("default", {
      month: "short",
      year: "2-digit",
    });
    return { monthStart, monthEnd, monthName };
  });

  const membershipGrowth = await Promise.all(
    months12.map(({ monthStart, monthEnd }) =>
      Membership.countDocuments({
        ...tf,
        createdAt: { $gte: monthStart, $lte: monthEnd },
      }),
    ),
  );

  const membershipGrowthData = months12.map(({ monthName }, i) => ({
    month: monthName,
    newMemberships: membershipGrowth[i],
  }));

  res.json({
    success: true,
    data: {
      revenueByDay: revenueByDayData,
      membershipGrowth: membershipGrowthData,
    },
  });
});

module.exports = { getDashboardSummary, getDashboardCharts };
