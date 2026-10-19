const asyncHandler = require("express-async-handler");
const Membership = require("../models/Membership");
const MembershipPlan = require("../models/MembershipPlan");
const Member = require("../models/Member");
const Invoice = require("../models/Invoice");
const logActivity = require("../utils/activityLogger");
const {
  r2,
  addDays,
  DAY,
  fail,
  sellMembership,
  endFreeze,
  createInvoice,
  refundPayment,
  runSweep,
} = require("../utils/gym");

const POPULATE_MEMBER = ["memberId", "name email phone memberCode photo"];
const POPULATE_PLAN = [
  "planId",
  "name type price durationDays freezeAllowedDays maxFreezes transferable",
];
const log = (req, action, m, description) =>
  logActivity({
    user: req.user,
    action,
    module: "Membership",
    description,
    targetId: m._id,
    ip: req.ip,
  });
const isManager = (u) =>
  ["super_admin", "gym_owner", "branch_manager"].includes(u.role);

const getMemberships = asyncHandler(async (req, res) => {
  const {
    branchId,
    memberId,
    status,
    planId,
    expiringInDays,
    dues,
    page = 1,
    limit = 50,
  } = req.query;
  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (branchId) query.branchId = branchId;
  if (memberId) query.memberId = memberId;
  if (planId) query.planId = planId;
  if (status) query.status = status;
  if (expiringInDays) {
    query.status = "active";
    query.endDate = {
      $gte: new Date(),
      $lte: addDays(new Date(), Number(expiringInDays)),
    };
  }
  if (dues === "true")
    query.$expr = { $gt: ["$totalAmount", { $add: ["$paidAmount", 0.005] }] };

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [memberships, total] = await Promise.all([
    Membership.find(query)
      .populate(...POPULATE_MEMBER)
      .populate(...POPULATE_PLAN)
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit)),
    Membership.countDocuments(query),
  ]);
  res.json({
    success: true,
    count: memberships.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: memberships,
  });
});

const getMembership = asyncHandler(async (req, res) => {
  const m = await Membership.findById(req.params.id)
    .populate(...POPULATE_MEMBER)
    .populate(...POPULATE_PLAN);
  if (!m) throw fail(404, "Membership not found");
  const invoice = await Invoice.findOne({ membershipId: m._id }).select(
    "invoiceNumber status totalAmount paidAmount payments",
  );
  res.json({ success: true, data: { ...m.toJSON(), invoice } });
});

// Sell a membership (+ invoice + first payment) in one call.
const createMembership = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.memberId || !b.planId)
    throw fail(400, "memberId and planId are required");
  const { membership, invoice, duplicate } = await sellMembership({
    tenantId: req.user.tenantId,
    branchId: b.branchId,
    memberId: b.memberId,
    planId: b.planId,
    startDate: b.startDate,
    discount: b.discount,
    couponCode: b.couponCode,
    payNow: b.payNow ?? 0,
    method: b.method,
    reference: b.reference,
    includeAdmission: b.includeAdmission,
    dueDate: b.dueDate,
    userId: req.user._id,
    autoRenew: !!b.autoRenew,
    idempotencyKey: b.idempotencyKey,
  });
  if (!duplicate)
    log(
      req,
      "CREATE",
      membership,
      `Sold ${membership.planName} to member ${membership.memberId} (${invoice.invoiceNumber})`,
    );
  res
    .status(duplicate ? 200 : 201)
    .json({ success: true, data: membership, invoice });
});

// Only non-financial fields may be edited directly; money moves via invoices/payments.
const updateMembership = asyncHandler(async (req, res) => {
  const m = await Membership.findById(req.params.id);
  if (!m) throw fail(404, "Membership not found");
  const { autoRenew, dueDate, branchId } = req.body;
  if (autoRenew !== undefined) m.autoRenew = !!autoRenew;
  if (dueDate !== undefined) m.dueDate = dueDate || undefined;
  if (branchId) m.branchId = branchId;
  if (req.body.endDate && isManager(req.user)) {
    m.endDate = new Date(req.body.endDate);
    if (m.endDate <= m.startDate)
      throw fail(400, "End date must be after the start date");
    if (m.status === "expired" && m.endDate > new Date()) m.status = "active";
  }
  await m.save();
  log(req, "UPDATE", m, `Updated membership ${m._id}`);
  res.json({ success: true, data: m });
});

const deleteMembership = asyncHandler(async (req, res) => {
  const m = await Membership.findById(req.params.id);
  if (!m) throw fail(404, "Membership not found");
  if (m.paidAmount > 0)
    throw fail(
      409,
      "This membership has payments on it. Cancel it (with a refund if needed) instead of deleting.",
    );
  await Promise.all([
    Membership.deleteOne({ _id: m._id }),
    Invoice.updateMany(
      { membershipId: m._id },
      { $set: { status: "cancelled" } },
    ),
  ]);
  log(req, "DELETE", m, `Deleted membership ${m._id}`);
  res.json({ success: true, message: "Membership deleted successfully" });
});

const freezeMembership = asyncHandler(async (req, res) => {
  const { days, reason, force } = req.body;
  const n = Math.floor(Number(days));
  if (!(n >= 1))
    throw fail(400, "Enter the number of days to freeze (at least 1)");
  const m = await Membership.findById(req.params.id);
  if (!m) throw fail(404, "Membership not found");
  if (m.status !== "active")
    throw fail(
      409,
      `Only an active membership can be frozen (this one is ${m.status})`,
    );
  const plan = await MembershipPlan.findById(m.planId);
  const override = !!force && isManager(req.user);
  if (!override) {
    if (!plan?.freezeAllowedDays)
      throw fail(400, "This plan does not allow freezing");
    if (m.freezeDaysUsed + n > plan.freezeAllowedDays)
      throw fail(
        400,
        `Only ${plan.freezeAllowedDays - m.freezeDaysUsed} freeze day(s) left on this plan`,
      );
    if (m.freezeHistory.length >= (plan.maxFreezes || 1))
      throw fail(
        400,
        `This plan allows ${plan.maxFreezes || 1} freeze(s) only`,
      );
  }
  const from = new Date();
  const to = addDays(from, n);
  // conditional: two taps on "Freeze" can't push two freezes
  const updated = await Membership.findOneAndUpdate(
    { _id: m._id, status: "active" },
    {
      $set: {
        status: "frozen",
        endDate: addDays(m.endDate, n),
        originalEndDate: m.originalEndDate || m.endDate,
      },
      $inc: { freezeDaysUsed: n },
      $push: { freezeHistory: { from, to, days: n, reason } },
    },
    { new: true },
  );
  if (!updated)
    throw fail(409, "Membership was already changed — refresh and try again");
  log(req, "FREEZE", updated, `Froze membership ${m._id} for ${n} days`);
  res.json({ success: true, data: updated });
});

const unfreezeMembership = asyncHandler(async (req, res) => {
  const m = await Membership.findById(req.params.id);
  if (!m) throw fail(404, "Membership not found");
  if (m.status !== "frozen") throw fail(409, "This membership is not frozen");
  await endFreeze(m);
  log(req, "UPDATE", m, `Unfroze membership ${m._id}`);
  res.json({ success: true, data: m });
});

// Renewal = a new membership that starts when the current one ends (or now, if lapsed).
const renewMembership = asyncHandler(async (req, res) => {
  const old = await Membership.findById(req.params.id);
  if (!old) throw fail(404, "Membership not found");
  const b = req.body;
  const { membership, invoice } = await sellMembership({
    tenantId: req.user.tenantId,
    branchId: old.branchId,
    memberId: old.memberId,
    planId: b.planId || old.planId,
    startDate: b.startDate,
    discount: b.discount,
    couponCode: b.couponCode,
    payNow: b.payNow ?? 0,
    method: b.method,
    reference: b.reference,
    includeAdmission: false,
    dueDate: b.dueDate,
    userId: req.user._id,
    isRenewal: true,
    autoRenew: b.autoRenew ?? old.autoRenew,
    idempotencyKey: b.idempotencyKey,
  });
  await Membership.updateOne(
    { _id: membership._id },
    { $set: { previousMembershipId: old._id } },
  );
  log(
    req,
    "UPDATE",
    membership,
    `Renewed membership ${old._id} (${invoice.invoiceNumber})`,
  );
  res.status(201).json({ success: true, data: membership, invoice });
});

// Upgrade: unused days of the current plan are credited against the new plan.
const upgradeMembership = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  if (!planId) throw fail(400, "planId is required to upgrade a membership");
  const old = await Membership.findOneAndUpdate(
    { _id: req.params.id, status: "active" },
    { $set: { status: "upgraded" } },
    { new: false },
  );
  if (!old) throw fail(409, "Only an active membership can be upgraded");
  try {
    const now = new Date();
    const totalDays = Math.max(
      1,
      Math.round((old.endDate - old.startDate) / DAY),
    );
    const left = Math.max(0, Math.ceil((old.endDate - now) / DAY));
    const credit = r2(Math.min(old.paidAmount, (old.price * left) / totalDays));
    const b = req.body;
    const { membership, invoice } = await sellMembership({
      tenantId: req.user.tenantId,
      branchId: old.branchId,
      memberId: old.memberId,
      planId,
      startDate: now,
      discount: (Number(b.discount) || 0) + credit,
      couponCode: b.couponCode,
      payNow: b.payNow ?? 0,
      method: b.method,
      reference: b.reference,
      includeAdmission: false,
      userId: req.user._id,
      isRenewal: false,
      previousMembershipId: old._id,
    });
    log(
      req,
      "CREATE",
      membership,
      `Upgraded membership ${old._id} (credit ₹${credit}, ${invoice.invoiceNumber})`,
    );
    res.status(201).json({ success: true, data: membership, invoice, credit });
  } catch (e) {
    await Membership.updateOne(
      { _id: old._id },
      { $set: { status: "active" } },
    ); // roll back
    throw e;
  }
});

const cancelMembership = asyncHandler(async (req, res) => {
  const { reason, refundAmount = 0, method } = req.body;
  const m = await Membership.findOneAndUpdate(
    {
      _id: req.params.id,
      status: { $in: ["active", "frozen", "upcoming", "expired"] },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    },
    { new: true },
  );
  if (!m)
    throw fail(
      409,
      "This membership can't be cancelled (already cancelled or upgraded)",
    );
  let invoice = null;
  if (Number(refundAmount) > 0) {
    const inv = await Invoice.findOne({ membershipId: m._id });
    if (!inv) throw fail(404, "No invoice found to refund against");
    invoice = await refundPayment(req.user.tenantId, inv._id, {
      amount: refundAmount,
      method,
      userId: req.user._id,
      note: `Cancellation: ${reason || ""}`,
    });
  }
  log(
    req,
    "CANCEL",
    m,
    `Cancelled membership ${m._id}${refundAmount ? ` with refund ₹${refundAmount}` : ""}`,
  );
  res.json({ success: true, data: m, invoice });
});

// Hand the remaining days to another member (only on plans that allow it).
const transferMembership = asyncHandler(async (req, res) => {
  const { toMemberId, fee = 0, payNow = 0, method } = req.body;
  if (!toMemberId) throw fail(400, "toMemberId is required");
  const m = await Membership.findById(req.params.id);
  if (!m) throw fail(404, "Membership not found");
  const plan = await MembershipPlan.findById(m.planId);
  if (!plan?.transferable && !isManager(req.user))
    throw fail(403, "This plan is not transferable");
  if (m.status !== "active")
    throw fail(409, "Only an active membership can be transferred");
  const to = await Member.findOne({ _id: toMemberId, tenantId: m.tenantId });
  if (!to) throw fail(404, "Receiving member not found");
  if (String(to._id) === String(m.memberId))
    throw fail(400, "Pick a different member");
  const now = new Date();
  const claimed = await Membership.findOneAndUpdate(
    { _id: m._id, status: "active" },
    {
      $set: {
        status: "cancelled",
        cancelledAt: now,
        cancelReason: `Transferred to ${to.name}`,
      },
    },
  );
  if (!claimed) throw fail(409, "Membership was already changed");
  let invoice = null;
  if (Number(fee) > 0) {
    invoice = await createInvoice({
      tenantId: m.tenantId,
      branchId: m.branchId,
      memberId: to._id,
      items: [
        {
          kind: "other",
          description: "Membership transfer fee",
          unitPrice: Number(fee),
          gstPercent: plan?.gstPercent ?? 18,
        },
      ],
      payNow,
      method,
      userId: req.user._id,
    });
  }
  const created = await Membership.create({
    tenantId: m.tenantId,
    branchId: to.branchId,
    memberId: to._id,
    planId: m.planId,
    planName: m.planName,
    startDate: now,
    endDate: m.endDate,
    originalEndDate: m.endDate,
    status: "active",
    price: 0,
    soldBy: req.user._id,
    previousMembershipId: m._id,
    freezeDaysUsed: m.freezeDaysUsed,
  });
  log(req, "UPDATE", m, `Transferred membership ${m._id} to ${to.name}`);
  res.status(201).json({ success: true, data: created, invoice });
});

const runSweepNow = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await runSweep(req.user.tenantId) });
});

module.exports = {
  getMemberships,
  getMembership,
  createMembership,
  updateMembership,
  deleteMembership,
  freezeMembership,
  unfreezeMembership,
  renewMembership,
  upgradeMembership,
  cancelMembership,
  transferMembership,
  runSweepNow,
};
