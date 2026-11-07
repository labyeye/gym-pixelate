const Razorpay = require("razorpay");
const PaymentIncident = require("../models/PaymentIncident");

/*
 * Pay -> provision saga for product subscriptions.
 *
 * The customer's money is taken first (gateway), then we create the company / subscription / invoice.
 * If any of those later steps fails we must never leave a paying customer with nothing:
 *   1. every write made so far is undone (Saga.rollback, newest first),
 *   2. the payment is refunded automatically (Razorpay) or queued for refund (other gateways / API down),
 *   3. the incident is stored (PaymentIncident) so a background sweep keeps retrying until it is refunded,
 *   4. the customer gets a clear message: pay nothing again, the refund is on its way.
 */

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

class PaymentRefundError extends Error {
  constructor(message, incident) {
    super(message);
    // 409, not 5xx: error handlers hide 5xx messages in production and the customer must read this one.
    this.statusCode = 409;
    this.status = 409;
    this.refund = true;
    this.incidentId = incident && incident._id;
  }
}

/** Journal of writes with their undo, so a half-finished activation can be reversed. */
class Saga {
  constructor() {
    this.undos = [];
  }
  async create(Model, doc) {
    const created = await Model.create(doc);
    this.undos.push([
      "delete " + Model.modelName,
      () => Model.deleteOne({ _id: created._id }),
    ]);
    return created;
  }
  /** $set the given fields; undo puts the old values back (fields that did not exist are unset). */
  async patch(Model, id, fields) {
    const before = await Model.findById(id)
      .select(Object.keys(fields).join(" "))
      .lean();
    if (!before) throw new Error(`${Model.modelName} ${id} not found`);
    await Model.updateOne({ _id: id }, { $set: fields });
    this.undos.push([
      "restore " + Model.modelName,
      () => {
        const set = {};
        const unset = {};
        for (const k of Object.keys(fields))
          (before[k] === undefined ? unset : set)[k] = before[k];
        return Model.updateOne(
          { _id: id },
          {
            ...(Object.keys(set).length && { $set: set }),
            ...(Object.keys(unset).length && { $unset: unset }),
          },
        );
      },
    ]);
  }
  async inc(Model, filter, field, by = 1) {
    const doc = await Model.findOneAndUpdate(
      filter,
      { $inc: { [field]: by } },
      { new: true },
    );
    if (doc)
      this.undos.push([
        "undo " + Model.modelName + "." + field,
        () => Model.updateOne({ _id: doc._id }, { $inc: { [field]: -by } }),
      ]);
    return doc;
  }
  /** Any other undo (e.g. a counter you cannot rewind: leave it out; gaps in invoice numbers are fine). */
  onRollback(name, fn) {
    this.undos.push([name, fn]);
  }
  async rollback() {
    const done = [];
    for (const [name, fn] of this.undos.reverse()) {
      try {
        await fn();
        done.push(name);
      } catch (e) {
        console.error(`[PaymentSaga] could not undo "${name}":`, e.message);
      }
    }
    this.undos = [];
    return done;
  }
}

let client; // replaced in tests
const rz = () =>
  client ||
  (client = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  }));
const _setClient = (c) => {
  client = c;
};

async function tryRefund(inc) {
  inc.attempts += 1;
  try {
    let paise = Math.round((inc.amount || 0) * 100);
    if (!paise) paise = (await rz().payments.fetch(inc.paymentId)).amount;
    const r = await rz().payments.refund(inc.paymentId, {
      amount: paise,
      speed: "optimum",
      notes: {
        reason: "Subscription could not be activated",
        incident: String(inc._id),
      },
    });
    inc.refundId = r.id;
    inc.amount = paise / 100;
    inc.status = "refund_initiated";
    inc.lastError = undefined;
  } catch (e) {
    const msg = e?.error?.description || e?.message || String(e);
    if (/already.*refund|fully refunded|refund.*already/i.test(msg)) {
      inc.status = "refunded";
      return;
    }
    inc.lastError = msg;
    inc.status = inc.attempts >= 10 ? "needs_manual" : "refund_pending";
  }
}

/** Plain SMTP mail (same SMTP_* env the apps already use). Never throws: the refund must not depend on email. */
async function sendRefundEmail(inc, payment) {
  try {
    const mongoose = require("mongoose");
    const nodemailer = require("nodemailer");
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    const M = mongoose.models;
    let who =
      payment.userId && M.User
        ? await M.User.findById(payment.userId).select("name email")
        : null;
    if (!who?.email && payment.ownerId)
      who =
        (M.Company &&
          (await M.Company.findById(payment.ownerId).select("name email"))) ||
        (M.Tenant &&
          (await M.Tenant.findById(payment.ownerId).select("name email"))) ||
        null;
    if (!who?.email) return;
    const brand = String(payment.product || "Nest").split(" ")[0];
    const amt = inc.amount || payment.amount;
    const started =
      inc.status === "refund_initiated" || inc.status === "refunded";
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#F0F6FF;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border:2px solid #000">
<div style="background:#024BAB;padding:20px 28px;border-bottom:2px solid #000"><h1 style="color:#fff;margin:0;font-size:18px">${brand} — your payment and refund</h1></div>
<div style="padding:28px;font-size:14px;color:#333;line-height:1.6">
<p>Hello ${who.name || "there"},</p>
<p>We received your payment${amt ? ` of <b>${inr(amt)}</b>` : ""} for <b>${payment.product || "your subscription"}</b>, but we could not finish setting it up.</p>
<p><b>Please don't pay again.</b> ${started ? "We have started an automatic refund to your original payment method." : "We will process your refund to your original payment method."} It usually reaches you in <b>5-7 working days</b>.</p>
<p style="background:#F8F8F8;border:1px solid #ddd;padding:10px">Payment reference: <b>${payment.paymentId}</b>${inc.refundId ? `<br/>Refund reference: <b>${inc.refundId}</b>` : ""}</p>
<p>You are welcome to try again whenever you like. If you need help, just reply to this email.</p>
</div></div></body></html>`;
    await nodemailer
      .createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure:
          process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
      .sendMail({
        from: `"${process.env.SMTP_FROM_NAME || brand}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: who.email,
        subject: `${brand} — your payment will be refunded`,
        html,
      });
    inc.emailedAt = new Date();
    await inc.save();
  } catch (e) {
    console.error("[PaymentSaga] refund email failed:", e.message);
  }
}

/**
 * Call when payment is confirmed but provisioning failed (after rollback). Always throws a PaymentRefundError.
 * `payment`: { gateway, paymentId, orderId?, amount? (rupees), product, ownerId?, userId? }
 */
async function refundAfterFailure(payment, error, rolledBack = []) {
  const key = { gateway: payment.gateway, paymentId: payment.paymentId };
  let inc = await PaymentIncident.findOne(key);
  if (!inc) {
    inc = new PaymentIncident({
      ...key,
      orderId: payment.orderId,
      amount: payment.amount,
      product: payment.product,
      ownerId: payment.ownerId,
      userId: payment.userId,
      failureReason: String(error?.message || error).slice(0, 500),
      rolledBack,
    });
  }
  const firstTime = inc.isNew;
  if (!["refund_initiated", "refunded"].includes(inc.status))
    await tryRefund(inc);
  await inc.save();
  if (firstTime) await sendRefundEmail(inc, payment);
  console.error(
    `[PaymentSaga] ${payment.product} payment ${payment.paymentId} could not be provisioned (${error?.message}); refund ${inc.status}`,
  );

  const known = inc.amount || payment.amount;
  const paid = known ? `payment of ${inr(known)}` : "payment";
  const back = known ? `refund of ${inr(known)}` : "full refund";
  const ref = `Reference: ${payment.paymentId}.`;
  const msg =
    inc.status === "refund_initiated" || inc.status === "refunded"
      ? `We received your ${paid}, but we could not finish setting up your subscription. Please don't pay again. We have started an automatic ${back} to your original payment method. It usually reaches you in 5-7 working days. ${ref}`
      : `We received your ${paid}, but we could not finish setting up your subscription. Please don't pay again. We will process your ${back} and it will reach your original payment method in 5-7 working days. ${ref}`;
  throw new PaymentRefundError(msg, inc);
}

/** Background sweep: keeps trying refunds that were queued or failed. Safe to run on an interval. */
async function retryPendingRefunds() {
  const list = await PaymentIncident.find({
    status: "refund_pending",
    attempts: { $lt: 10 },
  }).limit(25);
  for (const inc of list) {
    await tryRefund(inc);
    await inc.save();
  }
  return list.length;
}

/** Starts the retry sweep (every 10 minutes). Refunds are idempotent, so running it on several workers is safe. */
function startRefundSweep() {
  const refunds = setInterval(
    () =>
      retryPendingRefunds().catch((e) =>
        console.error("[PaymentSaga] sweep:", e.message),
      ),
    10 * 60 * 1000,
  );
  refunds.unref();
  // payments the gateway told us about (webhook) but whose browser/app never called verify
  const orphans = setInterval(
    () =>
      require("./paymentReconcile")
        .reconcile()
        .catch((e) => console.error("[PaymentReconcile]", e.message)),
    2 * 60 * 1000,
  );
  orphans.unref();
}

module.exports = {
  startRefundSweep,
  Saga,
  PaymentRefundError,
  refundAfterFailure,
  retryPendingRefunds,
  _setClient,
};
