const Counter = require("../models/Counter");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const MembershipPlan = require("../models/MembershipPlan");
const Coupon = require("../models/Coupon");
const Setting = require("../models/Setting");
const Branch = require("../models/Branch");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Subscription = require("../models/Subscription");
const PTPackage = require("../models/PTPackage");

const DAY = 24 * 60 * 60 * 1000;
const IST = 5.5 * 60 * 60 * 1000; // gyms here run on Indian time regardless of where the server sits

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
const istDayStart = (d = new Date()) =>
  new Date(Math.floor((new Date(d).getTime() + IST) / DAY) * DAY - IST);
/** 'YYYY-MM-DD' from a date picker means that calendar day in IST (start or end of it); anything else is parsed as-is. */
const istDay = (str, end = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return new Date(str);
  const start = Date.parse(`${str}T00:00:00Z`) - IST;
  return new Date(end ? start + DAY - 1 : start);
};
const istHHmm = (d = new Date()) =>
  new Date(new Date(d).getTime() + IST).toISOString().slice(11, 16);

/** Error carrying an HTTP status; errorHandler turns it into the response code. */
const fail = (status, message, extra) =>
  Object.assign(new Error(message), { status, ...extra });

const LIVE_INVOICE = { $nin: ["cancelled", "refunded"] };

/* -------------------------------------------------------------- plan limits */

/** Throws 403 if adding one more `kind` ('members' | 'branches' | 'staff') would exceed the tenant's SaaS plan. */
async function assertCapacity(tenantId, kind) {
  if (!tenantId) return;
  const tenant = await Tenant.findById(tenantId).select("plan").lean();
  const cap = (Subscription.PLAN_LIMITS[tenant?.plan] ||
    Subscription.PLAN_LIMITS.trial)[kind];
  if (cap === Infinity) return;
  const used =
    kind === "members"
      ? await Member.countDocuments({ tenantId, status: "active" })
      : kind === "branches"
        ? await Branch.countDocuments({ tenantId, isActive: true })
        : await User.countDocuments({
            tenantId,
            status: "active",
            role: { $nin: ["gym_owner", "member"] },
          });
  if (used >= cap) {
    throw fail(
      403,
      `Your ${tenant?.plan || "trial"} plan allows ${cap} ${kind}. Upgrade your NestGym plan to add more.`,
      { code: "PLAN_LIMIT" },
    );
  }
}

/* ------------------------------------------------------------------ branches */

/**
 * Every record belongs to a branch, but the UI of a single-branch gym never asks for one (so member /
 * invoice creation used to fail with "branchId required"). Fill it from: the body, the staff member's own
 * branch, the gym's first branch, or a new "Main Branch". A supplied id must belong to the caller's gym.
 */
async function ensureBranch(req) {
  const tenantId = req.user?.tenantId;
  const body = req.body;
  if (
    !tenantId ||
    req.method !== "POST" ||
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  )
    return;
  if (body.branchId) {
    if (
      !require("mongoose").isValidObjectId(body.branchId) ||
      !(await Branch.exists({ _id: body.branchId, tenantId }))
    )
      throw fail(400, "Unknown branch");
    return;
  }
  let id = req.user.branchId;
  if (!id) {
    const b =
      (await Branch.findOne({ tenantId, isActive: true }).sort("createdAt")) ||
      (await Branch.create({ tenantId, name: "Main Branch" }));
    id = b._id;
  }
  body.branchId = id;
}

/* ------------------------------------------------------------------ numbering */

async function nextCode(tenantId, key, prefix, pad = 5) {
  const n = await Counter.next(tenantId, key);
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

async function invoicePrefix(tenantId) {
  const s = await Setting.findOne({ tenantId }).select("invoicePrefix").lean();
  return (s?.invoicePrefix || "INV").trim();
}

/* ------------------------------------------------------------------- pricing */

/** items: [{description, quantity, unitPrice, gstPercent}] -> totals; discount is spread pro-rata over the items before GST. */
function computeTotals(items, discount = 0) {
  const lines = items.map((i) => ({
    ...i,
    quantity: i.quantity ?? 1,
    amount: r2((i.quantity ?? 1) * i.unitPrice),
  }));
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const disc = Math.min(r2(Math.max(0, discount)), subtotal);
  const ratio = subtotal ? disc / subtotal : 0;
  const gst = r2(
    lines.reduce(
      (s, l) => s + l.amount * (1 - ratio) * ((l.gstPercent || 0) / 100),
      0,
    ),
  );
  const taxable = r2(subtotal - disc);
  return {
    lines,
    subtotal,
    discount: disc,
    taxable,
    gst,
    total: r2(taxable + gst),
  };
}

async function resolveCoupon(tenantId, code, subtotal) {
  const c = await Coupon.findOne({
    tenantId,
    code: String(code).trim().toUpperCase(),
    isActive: true,
  });
  const now = new Date();
  if (!c) throw fail(400, "Invalid coupon code");
  if (c.validFrom && c.validFrom > now)
    throw fail(400, "This coupon is not active yet");
  if (c.validTill && c.validTill < now)
    throw fail(400, "This coupon has expired");
  if (subtotal < (c.minAmount || 0))
    throw fail(400, `Coupon needs a minimum bill of ₹${c.minAmount}`);
  if (c.usageLimit && c.usedCount >= c.usageLimit)
    throw fail(409, "This coupon has been fully used");
  let off = c.type === "percent" ? (subtotal * c.value) / 100 : c.value;
  if (c.type === "percent" && c.maxDiscount) off = Math.min(off, c.maxDiscount);
  return { coupon: c, discount: r2(Math.min(off, subtotal)) };
}

/** Atomic: two cashiers can't both burn the last use. */
const consumeCoupon = (c) =>
  Coupon.findOneAndUpdate(
    {
      _id: c._id,
      $or: [
        { usageLimit: 0 },
        { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
      ],
    },
    { $inc: { usedCount: 1 } },
    { new: true },
  );

/* ------------------------------------------------------------------ invoices */

/**
 * Creates an invoice (and optionally takes a first payment). Validates everything before the
 * invoice number is burned. Safe to retry with the same idempotencyKey.
 */
async function createInvoice({
  tenantId,
  branchId,
  memberId = null,
  membershipId = null,
  items,
  discount = 0,
  couponCode,
  payNow = 0,
  payFull = false,
  method = "cash",
  reference,
  dueDate,
  userId,
  notes,
  idempotencyKey,
}) {
  if (!items?.length)
    throw fail(400, "An invoice needs at least one line item");
  if (idempotencyKey) {
    const dup = await Invoice.findOne({ tenantId, idempotencyKey });
    if (dup) return dup;
  }
  const raw = computeTotals(items, 0);
  let off = Number(discount) || 0;
  let coupon = null;
  if (couponCode) {
    const res = await resolveCoupon(tenantId, couponCode, raw.subtotal);
    coupon = res.coupon;
    off += res.discount;
  }
  const t = computeTotals(items, off);
  if (payNow < 0) throw fail(400, "Payment cannot be negative");
  if (!payFull && r2(payNow) > t.total + 0.005)
    throw fail(400, `Payment ₹${payNow} is more than the bill ₹${t.total}`);
  if (coupon && !(await consumeCoupon(coupon)))
    throw fail(409, "This coupon has been fully used");

  const paid = payFull ? t.total : r2(payNow);
  const prefix = await invoicePrefix(tenantId);
  const invoiceNumber = await nextCode(tenantId, "invoice", prefix);
  try {
    return await Invoice.create({
      tenantId,
      branchId,
      memberId,
      membershipId,
      invoiceNumber,
      items: t.lines,
      amount: t.taxable,
      discount: t.discount,
      couponCode: coupon?.code,
      gstAmount: t.gst,
      totalAmount: t.total,
      paidAmount: paid,
      paymentMethod: method,
      dueDate,
      notes,
      createdBy: userId,
      idempotencyKey,
      payments:
        paid > 0
          ? [{ amount: paid, method, reference, receivedBy: userId }]
          : [],
      status:
        t.total - paid <= 0.005 ? "paid" : paid > 0 ? "partial" : "pending",
    });
  } catch (e) {
    if (coupon)
      await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: -1 } });
    throw e;
  }
}

const statusPipeline = [
  {
    $set: {
      status: {
        $switch: {
          branches: [
            {
              case: {
                $lte: ["$totalAmount", { $add: ["$paidAmount", 0.005] }],
              },
              then: "paid",
            },
            { case: { $gt: ["$paidAmount", 0.005] }, then: "partial" },
          ],
          default: "pending",
        },
      },
    },
  },
];

/** Collect a (part) payment against an invoice. Conditional update => can never overpay, never double-apply a retried key. */
async function recordPayment(
  tenantId,
  invoiceId,
  { amount, method = "cash", reference, idempotencyKey, userId, note },
) {
  amount = r2(amount);
  if (!(amount > 0))
    throw fail(400, "Payment amount must be greater than zero");
  const base = { _id: invoiceId, tenantId };
  if (idempotencyKey) {
    const done = await Invoice.findOne({
      ...base,
      "payments.idempotencyKey": idempotencyKey,
    });
    if (done) return done;
  }
  const updated = await Invoice.findOneAndUpdate(
    {
      ...base,
      status: { $in: ["pending", "partial"] },
      $expr: {
        $lte: [
          { $add: ["$paidAmount", amount] },
          { $add: ["$totalAmount", 0.005] },
        ],
      },
    },
    {
      $inc: { paidAmount: amount },
      $set: { paymentMethod: method },
      $push: {
        payments: {
          amount,
          method,
          reference,
          idempotencyKey,
          receivedBy: userId,
          note,
          type: "payment",
        },
      },
    },
    { new: true },
  );
  if (!updated) {
    const inv = await Invoice.findOne(base);
    if (!inv) throw fail(404, "Invoice not found");
    if (!["pending", "partial"].includes(inv.status))
      throw fail(409, `Invoice is already ${inv.status}`);
    throw fail(
      400,
      `Payment ₹${amount} is more than the balance ₹${r2(inv.totalAmount - inv.paidAmount)}`,
    );
  }
  await Invoice.updateOne({ _id: invoiceId }, statusPipeline);
  await syncMembershipPaid(updated);
  return Invoice.findById(invoiceId);
}

async function refundPayment(
  tenantId,
  invoiceId,
  { amount, method = "cash", reference, userId, note },
) {
  amount = r2(amount);
  if (!(amount > 0)) throw fail(400, "Refund amount must be greater than zero");
  const inv = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      tenantId,
      status: { $in: ["paid", "partial"] },
      paidAmount: { $gte: amount - 0.005 },
    },
    {
      $inc: { paidAmount: -amount },
      $push: {
        payments: {
          amount: -amount,
          method,
          reference,
          receivedBy: userId,
          note,
          type: "refund",
        },
      },
    },
    { new: true },
  );
  if (!inv)
    throw fail(
      409,
      "Refund is more than what was collected, or the invoice can't be refunded",
    );
  if (inv.paidAmount <= 0.005)
    await Invoice.updateOne(
      { _id: invoiceId },
      { $set: { status: "refunded" } },
    );
  else await Invoice.updateOne({ _id: invoiceId }, statusPipeline);
  await syncMembershipPaid(inv);
  return Invoice.findById(invoiceId);
}

async function syncMembershipPaid(inv) {
  if (!inv.membershipId) return;
  const fresh = await Invoice.findById(inv._id).select("paidAmount");
  await Membership.updateOne(
    { _id: inv.membershipId },
    { $set: { paidAmount: fresh.paidAmount } },
  );
}

/* --------------------------------------------------------------- memberships */

async function loadMemberAndPlan(tenantId, memberId, planId) {
  const [member, plan] = await Promise.all([
    Member.findOne({ _id: memberId, tenantId }),
    MembershipPlan.findOne({ _id: planId, tenantId }),
  ]);
  if (!member) throw fail(404, "Member not found");
  if (!plan) throw fail(404, "Membership plan not found");
  if (!plan.isActive) throw fail(400, "This plan is no longer on sale");
  if (member.status === "blacklisted")
    throw fail(403, "This member is blacklisted");
  return { member, plan };
}

/**
 * Sells (or renews / upgrades) a membership: validates, prices from the plan, issues one GST invoice,
 * takes the first payment, snapshots price + dues on the membership. Renewals queue after a still-running
 * membership instead of overlapping it.
 */
async function sellMembership({
  tenantId,
  branchId,
  memberId,
  planId,
  startDate,
  discount = 0,
  couponCode,
  payNow = 0,
  method = "cash",
  reference,
  includeAdmission,
  dueDate,
  userId,
  isRenewal = false,
  previousMembershipId = null,
  autoRenew = false,
  idempotencyKey,
}) {
  const { member, plan } = await loadMemberAndPlan(tenantId, memberId, planId);
  const now = new Date();

  const live = await Membership.findOne({
    tenantId,
    memberId,
    status: { $in: ["active", "frozen", "upcoming"] },
    endDate: { $gt: now },
  }).sort("-endDate");
  let start = startDate
    ? new Date(startDate)
    : live && !previousMembershipId
      ? live.endDate
      : now;
  if (Number.isNaN(start.getTime())) throw fail(400, "Invalid start date");
  const end = addDays(start, plan.durationDays);

  const hadBefore = await Membership.exists({ tenantId, memberId });
  const admission =
    includeAdmission === undefined ? !hadBefore : !!includeAdmission;

  const unit = plan.priceIncludesGst
    ? plan.price / (1 + plan.gstPercent / 100)
    : plan.price;
  const items = [
    {
      kind: "membership",
      refId: plan._id,
      description: `${plan.name} (${plan.durationDays} days)`,
      quantity: 1,
      unitPrice: r2(unit),
      gstPercent: plan.gstPercent,
    },
  ];
  if (admission && plan.admissionFee > 0) {
    const adm = plan.priceIncludesGst
      ? plan.admissionFee / (1 + plan.gstPercent / 100)
      : plan.admissionFee;
    items.push({
      kind: "admission",
      description: "Admission fee",
      quantity: 1,
      unitPrice: r2(adm),
      gstPercent: plan.gstPercent,
    });
  }

  const invoice = await createInvoice({
    tenantId,
    branchId: branchId || member.branchId,
    memberId,
    items,
    discount,
    couponCode,
    payNow,
    method,
    reference,
    dueDate,
    userId,
    idempotencyKey,
  });
  if (invoice.membershipId)
    return {
      invoice,
      membership: await Membership.findById(invoice.membershipId),
      duplicate: true,
    };

  try {
    const membership = await Membership.create({
      tenantId,
      branchId: branchId || member.branchId,
      memberId,
      planId: plan._id,
      planName: plan.name,
      startDate: start,
      endDate: end,
      originalEndDate: end,
      status: start > now ? "upcoming" : "active",
      price: plan.price,
      admissionFee: admission ? plan.admissionFee : 0,
      discount: invoice.discount,
      couponCode: invoice.couponCode,
      gstAmount: invoice.gstAmount,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      dueDate,
      isRenewal,
      previousMembershipId,
      soldBy: userId,
      autoRenew,
    });
    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { membershipId: membership._id } },
    );
    invoice.membershipId = membership._id;
    return { invoice, membership };
  } catch (e) {
    // don't leave a bill for a membership that was never created
    await Invoice.updateOne(
      { _id: invoice._id },
      {
        $set: {
          status: "cancelled",
          notes: "Auto-cancelled: membership could not be created",
        },
      },
    );
    throw e;
  }
}

/** Ends a freeze (early or on schedule) and hands the unused paused days back to the member's end date. */
async function endFreeze(m, now = new Date()) {
  const f = m.freezeHistory[m.freezeHistory.length - 1];
  if (m.status !== "frozen" || !f || f.endedAt) return m;
  const used = Math.max(
    0,
    Math.min(f.days, Math.ceil((now - new Date(f.from)) / DAY)),
  );
  const unused = f.days - used;
  f.days = used;
  f.endedAt = now;
  m.freezeDaysUsed = Math.max(0, m.freezeDaysUsed - unused);
  m.endDate = addDays(m.endDate, -unused);
  m.status = m.endDate < now ? "expired" : "active";
  await m.save();
  return m;
}

/* --------------------------------------------------------------------- sweep */

/** Idempotent housekeeping; safe to run as often as you like (and per tenant for tests). */
async function runSweep(tenantId) {
  const now = new Date();
  const t = tenantId ? { tenantId } : {};
  const out = {};

  out.activated = (
    await Membership.updateMany(
      { ...t, status: "upcoming", startDate: { $lte: now } },
      { $set: { status: "active" } },
    )
  ).modifiedCount;

  const frozen = await Membership.find({ ...t, status: "frozen" });
  let unfrozen = 0;
  for (const m of frozen) {
    const f = m.freezeHistory[m.freezeHistory.length - 1];
    if (f && !f.endedAt && f.to && f.to <= now) {
      await endFreeze(m, now);
      unfrozen++;
    }
  }
  out.unfrozen = unfrozen;

  out.expired = (
    await Membership.updateMany(
      { ...t, status: "active", endDate: { $lt: now } },
      { $set: { status: "expired" } },
    )
  ).modifiedCount;

  out.ptExpired = (
    await PTPackage.updateMany(
      { ...t, status: "active", validTill: { $lt: now } },
      { $set: { status: "expired" } },
    )
  ).modifiedCount;
  return out;
}

module.exports = {
  DAY,
  r2,
  addDays,
  istDayStart,
  istDay,
  istHHmm,
  fail,
  LIVE_INVOICE,
  ensureBranch,
  assertCapacity,
  nextCode,
  computeTotals,
  resolveCoupon,
  createInvoice,
  recordPayment,
  refundPayment,
  sellMembership,
  endFreeze,
  runSweep,
};
