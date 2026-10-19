const asyncHandler = require("express-async-handler");
const ActivityLog = require("../models/ActivityLog");

const getActivityLogs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 100,
    module,
    action,
    userId,
    search,
    startDate,
    endDate,
  } = req.query;

  const query = {};

  if (req.user.tenantId) query.tenantId = req.user.tenantId;

  if (module) query.module = module;
  if (action) query.action = action;
  if (userId) query.user = userId;

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.timestamp.$lte = end;
    }
  }

  if (search) {
    query.$or = [
      { description: { $regex: search, $options: "i" } },
      { userName: { $regex: search, $options: "i" } },
      { userEmail: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [logs, total] = await Promise.all([
    ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    ActivityLog.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: logs.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: logs,
  });
});

const getActivityStats = asyncHandler(async (req, res) => {
  const tf = req.user.tenantId ? { tenantId: req.user.tenantId } : {};
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalLogs,
    last24hCount,
    last7dCount,
    byAction,
    byModule,
    recentLogins,
    loginFails,
  ] = await Promise.all([
    ActivityLog.countDocuments({ ...tf }),
    ActivityLog.countDocuments({ ...tf, timestamp: { $gte: last24h } }),
    ActivityLog.countDocuments({ ...tf, timestamp: { $gte: last7d } }),
    ActivityLog.aggregate([
      { $match: { ...tf } },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ActivityLog.aggregate([
      { $match: { ...tf } },
      { $group: { _id: "$module", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ActivityLog.countDocuments({
      ...tf,
      action: "LOGIN",
      timestamp: { $gte: last24h },
    }),
    ActivityLog.countDocuments({
      ...tf,
      action: "LOGIN_FAILED",
      timestamp: { $gte: last24h },
    }),
  ]);

  res.json({
    success: true,
    data: {
      totalLogs,
      last24hCount,
      last7dCount,
      recentLogins,
      loginFails,
      byAction,
      byModule,
    },
  });
});

module.exports = { getActivityLogs, getActivityStats };
