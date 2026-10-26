const Razorpay = require("razorpay");
const Mandate = require("../models/Mandate");
const Membership = require("../models/Membership");
const MembershipPlan = require("../models/MembershipPlan");
const { getCreds } = require("./gymPay");
const { sellMembership, fail } = require("./gym");

const r2 = (n) => Math.round(n * 100) / 100;
const client = (c) => new Razorpay({ key_id: c.keyId, key_secret: c.keySecret });

// Razorpay billing cycles only come as day/week/month/year, so only plans that map cleanly are allowed.
function cycle(days) {
  if (days % 365 === 0) return { period: "yearly", interval: days / 365 };
  if (days % 30 === 0) return { period: "monthly", interval: days / 30 };
  if (days % 7 === 0) return { period: "weekly", interval: days / 7 };
  return null;
}

// Network calls live here so tests can replace them (same pattern as gymPay.api).
const rzp = {
  createPlan: (c, body) => client(c).plans.create(body),
  createSubscription: (c, body) => client(c).subscriptions.create(body),
  cancelSubscription: (c, id) => client(c).subscriptions.cancel(id, false),
};

/** Starts an autopay mandate for a membership. Returns the Mandate (its shortUrl is what the member opens). */
async function enable(tenantId, membershipId, userId) {
  const ms = await Membership.findOne({ _id: membershipId, tenantId });
  if (!ms) throw fail(404, "Membership not found");
  if (!["active", "upcoming", "expired"].includes(ms.status)) throw fail(400, "This membership cannot be set to auto-renew");
  const live = await Mandate.findOne({ tenantId, memberId: ms.memberId, status: { $in: ["created", "authenticated", "active"] } });
  if (live) throw fail(400, "Autopay is already set up for this member");
  const plan = await MembershipPlan.findOne({ _id: ms.planId, tenantId });
  if (!plan || !plan.isActive) throw fail(400, "This plan is no longer on sale");
  const cyc = cycle(plan.durationDays);
  if (!cyc) throw fail(400, `Autopay needs a plan of whole weeks, months or years (this one is ${plan.durationDays} days)`);

  const amount = r2(plan.priceIncludesGst ? plan.price : plan.price * (1 + plan.gstPercent / 100));
  const creds = await getCreds(tenantId);
  const rp = await rzp.createPlan(creds, { ...cyc, item: { name: plan.name.slice(0, 80), amount: Math.round(amount * 100), currency: "INR" } });
  const startAt = ms.endDate > new Date() ? Math.floor(ms.endDate.getTime() / 1000) : undefined; // first charge on expiry day
  const sub = await rzp.createSubscription(creds, {
    plan_id: rp.id,
    total_count: 120,
    customer_notify: 1,
    ...(startAt && { start_at: startAt }),
    notes: { tenantId: String(tenantId), memberId: String(ms.memberId), membershipId: String(ms._id) },
  });
  return Mandate.create({
    tenantId, memberId: ms.memberId, membershipId: ms._id, planId: plan._id, amount,
    razorpayPlanId: rp.id, razorpaySubscriptionId: sub.id, shortUrl: sub.short_url, createdBy: userId,
  });
}

async function cancel(tenantId, mandateId) {
  const m = await Mandate.findOne({ _id: mandateId, tenantId });
  if (!m) throw fail(404, "Mandate not found");
  if (["cancelled", "completed"].includes(m.status)) return m;
  try {
    await rzp.cancelSubscription(await getCreds(tenantId), m.razorpaySubscriptionId);
  } catch (e) {
    if (!/already|cancel/i.test(e?.error?.description || e.message || "")) throw fail(502, "Razorpay did not cancel it, try again");
  }
  m.status = "cancelled";
  await m.save();
  return m;
}

const STATUS = { "subscription.authenticated": "authenticated", "subscription.activated": "active", "subscription.paused": "paused", "subscription.halted": "halted", "subscription.cancelled": "cancelled", "subscription.completed": "completed" };

/** Razorpay subscription.* webhook (already signature-checked). Idempotent per payment id. */
async function onEvent(tenantId, evt) {
  const sub = evt.payload?.subscription?.entity;
  const m = sub && (await Mandate.findOne({ tenantId, razorpaySubscriptionId: sub.id }));
  if (!m) return "unknown-subscription";
  if (STATUS[evt.event]) {
    await Mandate.updateOne({ _id: m._id }, { status: STATUS[evt.event] });
    return STATUS[evt.event];
  }
  if (evt.event !== "subscription.charged") return "ignored";

  const p = evt.payload?.payment?.entity;
  if (!p || p.status !== "captured" || m.lastPaymentId === p.id) return "duplicate";
  const prev = await Membership.findOne({ tenantId, memberId: m.memberId, status: { $in: ["active", "upcoming", "expired", "frozen"] } }).sort("-endDate");
  const { invoice, membership } = await sellMembership({
    tenantId,
    branchId: prev?.branchId,
    memberId: m.memberId,
    planId: m.planId,
    payNow: Math.min(p.amount / 100, m.amount),
    method: "online",
    reference: p.id,
    includeAdmission: false,
    isRenewal: true,
    autoRenew: true,
    idempotencyKey: `rzp-sub:${p.id}`,
  });
  if (prev) await Membership.updateOne({ _id: membership._id }, { previousMembershipId: prev._id });
  await Mandate.updateOne({ _id: m._id }, { status: "active", $inc: { chargesCount: 1 }, lastChargeAt: new Date(), lastPaymentId: p.id });
  return invoice.invoiceNumber;
}

module.exports = { enable, cancel, onEvent, rzp, cycle };
