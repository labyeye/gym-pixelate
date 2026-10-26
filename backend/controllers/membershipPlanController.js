const asyncHandler = require("express-async-handler");
const MembershipPlan = require("../models/MembershipPlan");
const Membership = require("../models/Membership");
const logActivity = require("../utils/activityLogger");

const getPlans = asyncHandler(async (req, res) => {
  const { branchId, isActive, page = 1, limit = 50 } = req.query;

  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (branchId) query.branchId = branchId;
  if (isActive !== undefined) query.isActive = isActive === "true";

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [plans, total] = await Promise.all([
    MembershipPlan.find(query)
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit)),
    MembershipPlan.countDocuments(query),
  ]);

  // how many members hold each plan (active now / ever)
  const counts = await Membership.aggregate([
    {
      $match: {
        planId: { $in: plans.map((p) => p._id) },
        status: { $ne: "cancelled" },
        ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
      },
    },
    {
      $group: {
        _id: "$planId",
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $in: ["$status", ["active", "frozen"]] }, 1, 0] },
        },
      },
    },
  ]);
  const byPlan = new Map(counts.map((c) => [String(c._id), c]));
  const data = plans.map((p) => ({
    ...p.toObject(),
    subscribers: {
      active: byPlan.get(String(p._id))?.active || 0,
      total: byPlan.get(String(p._id))?.total || 0,
    },
  }));

  res.json({
    success: true,
    count: plans.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data,
  });
});

const getPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findById(req.params.id);

  if (!plan) {
    res.status(404);
    throw new Error("Membership plan not found");
  }

  res.json({ success: true, data: plan });
});

const createPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.create({
    ...req.body,
    tenantId: req.user.tenantId || null,
  });

  logActivity({
    user: req.user,
    action: "CREATE",
    module: "MembershipPlan",
    description: `Created membership plan: ${plan.name}`,
    targetId: plan._id,
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: plan });
});

const updatePlan = asyncHandler(async (req, res) => {
  let plan = await MembershipPlan.findById(req.params.id);

  if (!plan) {
    res.status(404);
    throw new Error("Membership plan not found");
  }

  plan = await MembershipPlan.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "MembershipPlan",
    description: `Updated membership plan: ${plan.name}`,
    targetId: plan._id,
    ip: req.ip,
  });

  res.json({ success: true, data: plan });
});

const deletePlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findById(req.params.id);

  if (!plan) {
    res.status(404);
    throw new Error("Membership plan not found");
  }

  await MembershipPlan.updateOne({ _id: plan._id }, { deletedAt: new Date() }); // restorable from /api/trash

  logActivity({
    user: req.user,
    action: "DELETE",
    module: "MembershipPlan",
    description: `Deleted membership plan: ${plan.name}`,
    targetId: plan._id,
    ip: req.ip,
  });

  res.json({ success: true, message: "Membership plan deleted successfully" });
});

module.exports = { getPlans, getPlan, createPlan, updatePlan, deletePlan };
