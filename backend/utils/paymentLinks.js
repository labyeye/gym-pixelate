const crypto = require("crypto");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const PaymentLink = require("../models/PaymentLink");
const Setting = require("../models/Setting");
const Tenant = require("../models/Tenant");
const pay = require("./gymPay");
const { fail, r2, recordPayment } = require("./gym");
const { parsePhone } = require("./phone");
const { sendPlatformTemplate } = require("./whatsappOtp");

/*
 * "Pay your fee" links for members, like NestAcademy's guardian payment links: a WhatsApp message with a
 * public /pay/<token> page. Money goes to the GYM's own Razorpay (gymPay.getCreds), the token is the
 * only credential, and what is owed is re-read from the invoice every time it is used.
 */
const LINK_TTL_DAYS = 30;
const MAX_SEND_ATTEMPTS = 3;
const frontendUrl = () => process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://gym.pixelatenest.com";
const linkUrl = (token) => `${frontendUrl()}/pay/${token}`;
const IST_MS = 5.5 * 60 * 60 * 1000;
const monthKey = (d = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 7);
const balanceOf = (inv) => r2(inv.totalAmount - inv.paidAmount);
const isOwing = (inv) => ["pending", "partial"].includes(inv.status) && balanceOf(inv) >= 1;

/** Creates (or revives) the single link for an invoice. */
async function ensureLink(tenantId, inv) {
  if (!inv.memberId) throw fail(400, "Walk-in invoices have no member to send a link to");
  if (!isOwing(inv)) throw fail(409, "Nothing is due on this invoice");
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 86400000);
  const existing = await PaymentLink.findOne({ invoiceId: inv._id });
  if (existing) {
    // a partial payment, or an old expired link, comes back to life with a fresh window
    if (existing.status !== "pending" || existing.expiresAt < new Date()) {
      existing.status = "pending";
      existing.paidAt = undefined;
    }
    existing.expiresAt = expiresAt;
    return existing.save();
  }
  return PaymentLink.create({
    tenantId,
    invoiceId: inv._id,
    memberId: inv.memberId,
    token: crypto.randomBytes(24).toString("base64url"),
    expiresAt,
  });
}

async function gymName(tenantId) {
  const [s, t] = await Promise.all([Setting.findOne({ tenantId }).select("companyName").lean(), Tenant.findById(tenantId).select("name").lean()]);
  return s?.companyName || t?.name || "your gym";
}

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Text a staff member can paste/share manually if the WhatsApp API is not set up. */
async function shareMessage(tenantId, inv, member, link) {
  return `Hi ${member.name}, ${rupees(balanceOf(inv))} is due at ${await gymName(tenantId)} (invoice ${inv.invoiceNumber}). Pay securely online: ${linkUrl(link.token)}`;
}

/**
 * Sends this month's reminder for every outstanding invoice that has not had one this month.
 * Needs the platform WhatsApp number + the approved template (see WHATSAPP_PAYLINK_TEMPLATE_NAME).
 */
async function sendDue(tenantId, now = new Date()) {
  const stats = { sent: 0, skipped: 0, failed: 0, noPhone: 0 };
  const cfgWa = await Setting.findOne({ tenantId }).select("whatsappEnabled reminders.paymentLink").lean();
  if (cfgWa && (cfgWa.whatsappEnabled === false || cfgWa.reminders?.paymentLink === false)) return stats; // owner turned it off
  const month = monthKey(now);
  const name = await gymName(tenantId);
  const invoices = await Invoice.find({ tenantId, status: { $in: ["pending", "partial"] }, memberId: { $ne: null } }).limit(500);
  for (const inv of invoices) {
    if (!isOwing(inv)) continue;
    const member = await Member.findById(inv.memberId).select("name phone whatsappOptIn");
    const phone = member && parsePhone(member.phone);
    if (!member || !phone) { stats.noPhone++; continue; }
    if (member.whatsappOptIn === false) { stats.skipped++; continue; }
    const link = await ensureLink(tenantId, inv);
    if (link.lastSentMonth === month || link.sendAttempts >= MAX_SEND_ATTEMPTS) { stats.skipped++; continue; }
    try {
      await sendPlatformTemplate(
        phone.e164,
        process.env.WHATSAPP_PAYLINK_TEMPLATE_NAME || "nestgym_fee_payment_link",
        [member.name, name, rupees(balanceOf(inv)), inv.invoiceNumber, linkUrl(link.token)],
        process.env.WHATSAPP_PAYLINK_TEMPLATE_LANG || "en",
        { tenantId, kind: "payment_link" },
      );
      link.sentAt = new Date();
      link.lastSentMonth = month;
      link.lastError = undefined;
      stats.sent++;
    } catch (err) {
      if (err.code === "NO_CREDITS") {
        // no top-up yet: do not burn the member's retry attempts, and stop this gym's run
        link.lastError = err.message;
        await link.save();
        stats.noCredits = true;
        break;
      }
      link.sendAttempts += 1;
      link.lastError = err.message;
      stats.failed++;
    }
    await link.save();
  }
  return stats;
}

/* ------------------------------------------------------------------ public side */

async function loadLink(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const link = await PaymentLink.findOne({ token });
  if (link && link.status === "pending" && link.expiresAt < new Date()) {
    link.status = "expired";
    await link.save();
  }
  return link;
}

async function details(token) {
  const link = await loadLink(token);
  if (!link) return null;
  const [inv, member, name] = await Promise.all([
    Invoice.findOne({ _id: link.invoiceId, tenantId: link.tenantId }),
    Member.findOne({ _id: link.memberId, tenantId: link.tenantId }).select("name"),
    gymName(link.tenantId),
  ]);
  let status = link.status;
  if (status === "pending" && (!inv || !isOwing(inv))) status = "settled"; // paid at the desk meanwhile
  return {
    status, // pending | paid | expired | settled
    gymName: name,
    memberName: member?.name || "",
    invoiceNumber: inv?.invoiceNumber,
    amount: inv ? balanceOf(inv) : 0,
    description: inv?.items?.[0]?.description,
    paidAt: link.paidAt,
    expiresAt: link.expiresAt,
  };
}

async function start(token) {
  const link = await loadLink(token);
  if (!link) throw fail(404, "Payment link not found");
  if (link.status === "paid") throw fail(409, "This invoice is already paid");
  if (link.status === "expired") throw fail(410, "This payment link has expired");
  const inv = await Invoice.findOne({ _id: link.invoiceId, tenantId: link.tenantId });
  if (!inv || !isOwing(inv)) throw fail(409, "Nothing is due on this invoice any more");
  const member = await Member.findOne({ _id: link.memberId, tenantId: link.tenantId }).select("name phone email");
  const creds = await pay.getCreds(link.tenantId);
  const amount = balanceOf(inv);
  const order = await pay.api.createOrder(creds, {
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: inv.invoiceNumber.slice(0, 40),
    notes: { invoiceId: String(inv._id), memberId: String(link.memberId), linkId: String(link._id) },
  });
  link.orderId = order.id;
  await link.save();
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || "INR",
    key: creds.keyId,
    invoiceNumber: inv.invoiceNumber,
    name: member?.name,
    phone: member?.phone,
    email: member?.email,
  };
}

// Signature check + server-side fetch of the payment, then book it on the invoice. Idempotent on the Razorpay payment id.
async function confirm(token, { razorpayOrderId, razorpayPaymentId, razorpaySignature } = {}) {
  const link = await loadLink(token);
  if (!link) throw fail(404, "Payment link not found");
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) throw fail(400, "Missing payment details");
  if (!link.orderId || link.orderId !== razorpayOrderId) throw fail(400, "Payment does not match this link");
  const creds = await pay.getCreds(link.tenantId);
  if (!pay.verifySignature(creds.keySecret, razorpayOrderId, razorpayPaymentId, razorpaySignature)) throw fail(400, "Payment signature is invalid");
  const p = await pay.api.fetchPayment(creds, razorpayPaymentId);
  if (!p || p.order_id !== razorpayOrderId || !["captured", "authorized"].includes(p.status)) throw fail(400, "Payment was not completed");
  if (p.notes?.invoiceId && String(p.notes.invoiceId) !== String(link.invoiceId)) throw fail(400, "Payment belongs to a different invoice");
  const updated = await recordPayment(link.tenantId, link.invoiceId, {
    amount: p.amount / 100,
    method: "online",
    reference: razorpayPaymentId,
    idempotencyKey: `rzp:${razorpayPaymentId}`,
    note: "Paid online via WhatsApp payment link",
  });
  if (!isOwing(updated)) {
    link.status = "paid";
    link.paidAt = new Date();
    await link.save();
  }
  return { status: isOwing(updated) ? "partial" : "paid", balance: Math.max(0, balanceOf(updated)) };
}

module.exports = { ensureLink, shareMessage, sendDue, details, start, confirm, linkUrl, monthKey };
