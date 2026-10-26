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
    search,
    sort,
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
  if (search) {
    const rx = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const ids = await Member.find({
      ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
      $or: [{ name: rx }, { phone: rx }, { memberCode: rx }],
    }).distinct("_id");
    query.memberId = { $in: ids };
  }

  // headline numbers for the status page, independent of the filters above
  const base = req.user.tenantId ? { tenantId: req.user.tenantId } : {};
  const counts = Promise.all([
    Membership.countDocuments({ ...base, status: "active" }),
    Membership.countDocuments({
      ...base,
      status: "active",
      endDate: { $gte: new Date(), $lte: addDays(new Date(), 7) },
    }),
    Membership.countDocuments({ ...base, status: "expired" }),
    Membership.countDocuments({
      ...base,
      status: { $nin: ["cancelled", "upgraded"] },
      $expr: { $gt: ["$totalAmount", { $add: ["$paidAmount", 0.005] }] },
    }),
  ]);

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [memberships, total] = await Promise.all([
    Membership.find(query)
      .populate(...POPULATE_MEMBER)
      .populate(...POPULATE_PLAN)
      .sort(["endDate", "-endDate", "-createdAt"].includes(sort) ? sort : "-createdAt")
      .skip(skip)
      .limit(parseInt(limit)),
    Membership.countDocuments(query),
  ]);
  const [active, expiring, expired, withDues] = await counts;
  // the invoice each membership was billed on, so the app can collect fees / open the receipt directly
  const invs = await Invoice.find({ membershipId: { $in: memberships.map((m) => m._id) } })
    .select("_id invoiceNumber membershipId")
    .sort("issuedAt")
    .lean();
  const invOf = new Map();
  for (const i of invs) if (!invOf.has(String(i.membershipId))) invOf.set(String(i.membershipId), i);
  const rows = memberships.map((m) => {
    const i = invOf.get(String(m._id));
    return { ...m.toObject(), invoiceId: i?._id, invoiceNumber: i?.invoiceNumber };
  });
  res.json({
    success: true,
    count: memberships.length,
    counts: { active, expiring, expired, dues: withDues },
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: rows,
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

// ── Changing plan ─────────────────────────────────────────────────────────
// Within 24 h of buying, what was already paid is credited in full (2k paid -> 4k plan = pay 2k more),
// and the member can do it themselves. After that only the owner / a manager can change it, and the
// credit is the unused part of the old plan.
const CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;
// same rounding as the invoice line, so the quote equals the bill
const unitOf = (plan) =>
  r2(plan.priceIncludesGst ? plan.price / (1 + (plan.gstPercent || 0) / 100) : plan.price);

async function quoteUpgrade(old, plan, now = new Date()) {
  const withinWindow = now - old.createdAt <= CHANGE_WINDOW_MS;
  const g = plan.gstPercent || 0;
  const unit = unitOf(plan);
  const newTotal = r2(unit * (1 + g / 100));
  let credit;
  let discount; // taken off the taxable amount, GST is then charged on what is left
  if (withinWindow) {
    const oldPlan = await MembershipPlan.findById(old.planId);
    const og = oldPlan?.gstPercent || 0;
    const admission = old.admissionFee
      ? oldPlan?.priceIncludesGst
        ? old.admissionFee
        : old.admissionFee * (1 + og / 100)
      : 0;
    credit = Math.min(
      newTotal,
      r2(Math.max(0, Math.min(old.paidAmount, old.totalAmount) - admission)),
    );
    // pick the paisa that lands the payable exactly on (new price - what was paid)
    const target = r2(newTotal - credit);
    const raw = unit - target / (1 + g / 100);
    discount = [Math.floor(raw * 100) / 100, Math.ceil(raw * 100) / 100].sort(
      (a, b) => Math.abs((unit - a) * (1 + g / 100) - target) - Math.abs((unit - b) * (1 + g / 100) - target),
    )[0];
  } else {
    const totalDays = Math.max(1, Math.round((old.endDate - old.startDate) / DAY));
    const left = Math.max(0, Math.ceil((old.endDate - now) / DAY));
    credit = r2(Math.min(old.paidAmount, (old.price * left) / totalDays));
    discount = credit;
  }
  return {
    withinWindow,
    windowEndsAt: new Date(old.createdAt.getTime() + CHANGE_WINDOW_MS),
    newTotal,
    credit,
    discount,
    payable: r2(Math.max(0, (unit - discount) * (1 + g / 100))),
  };
}

async function performUpgrade({ old, plan, body = {}, userId, tenantId }) {
  const q = await quoteUpgrade(old, plan);
  const { membership, invoice } = await sellMembership({
    tenantId,
    branchId: old.branchId,
    memberId: old.memberId,
    planId: plan._id,
    startDate: new Date(),
    discount: (Number(body.discount) || 0) + q.discount,
    couponCode: body.couponCode,
    payNow: body.payNow ?? 0,
    method: body.method,
    reference: body.reference,
    includeAdmission: false,
    userId,
    isRenewal: false,
    previousMembershipId: old._id,
  });
  return { membership, invoice, credit: q.credit, withinWindow: q.withinWindow, payable: q.payable };
}

const upgradeQuote = asyncHandler(async (req, res) => {
  const old = await Membership.findOne({ _id: req.params.id, status: "active" });
  if (!old) throw fail(409, "Only an active membership can be changed");
  const plan = await MembershipPlan.findById(req.query.planId);
  if (!plan) throw fail(404, "Plan not found");
  const q = await quoteUpgrade(old, plan);
  res.json({ success: true, data: { ...q, allowed: q.withinWindow || isManager(req.user) } });
});

const upgradeMembership = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  if (!planId) throw fail(400, "planId is required to upgrade a membership");
  const plan = await MembershipPlan.findById(planId);
  if (!plan) throw fail(404, "Plan not found");
  const cur = await Membership.findOne({ _id: req.params.id, status: "active" });
  if (!cur) throw fail(409, "Only an active membership can be upgraded");
  if (String(cur.planId) === String(plan._id)) throw fail(400, "Pick a different plan");
  if (Date.now() - cur.createdAt > CHANGE_WINDOW_MS && !isManager(req.user))
    throw fail(403, "Plans can only be changed after 24 hours by the gym owner or a manager.");
  const old = await Membership.findOneAndUpdate(
    { _id: req.params.id, status: "active" },
    { $set: { status: "upgraded" } },
    { new: false },
  );
  if (!old) throw fail(409, "Only an active membership can be upgraded");
  try {
    const r = await performUpgrade({ old, plan, body: req.body, userId: req.user._id, tenantId: req.user.tenantId });
    log(
      req,
      "CREATE",
      r.membership,
      `Upgraded membership ${old._id} (credit ₹${r.credit}${r.withinWindow ? ", within 24h" : ""}, ${r.invoice.invoiceNumber})`,
    );
    res.status(201).json({ success: true, data: r.membership, invoice: r.invoice, credit: r.credit });
  } catch (e) {
    await Membership.updateOne({ _id: old._id }, { $set: { status: "active" } }); // roll back
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
  upgradeQuote,
  quoteUpgrade,
  performUpgrade,
  CHANGE_WINDOW_MS,
  cancelMembership,
  transferMembership,
  runSweepNow,
};
