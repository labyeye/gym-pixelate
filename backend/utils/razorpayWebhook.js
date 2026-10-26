const crypto = require("crypto");
const Setting = require("../models/Setting");
const Invoice = require("../models/Invoice");
const PaymentLink = require("../models/PaymentLink");
const { decrypt } = require("./encryption");
const { recordPayment } = require("./gym");

const owing = (inv) => ["pending", "partial"].includes(inv.status);

/*
 * Razorpay -> NestGym webhook for a GYM's own Razorpay account (member payments).
 * URL (one per gym, shown in Settings):  POST /api/webhooks/razorpay/<tenantId>
 * The gym pastes the webhook secret in Settings; the body is verified with HMAC-SHA256 over the RAW body.
 * It books `payment.captured` / `order.paid` on the invoice named in the order notes, with the same
 * idempotency key as the browser verify (`rzp:<paymentId>`), so a payment is never counted twice and a
 * payment whose browser tab was closed (or still "authorized" at that moment) still lands on the invoice.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sameSig = (secret, raw, given) => {
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(given || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

async function handle(req, res) {
  const { tenantId } = req.params;
  const raw = req.body; // Buffer (express.raw)
  if (!/^[a-f0-9]{24}$/i.test(tenantId || "") || !Buffer.isBuffer(raw)) return res.status(400).json({ success: false });

  const s = await Setting.findOne({ tenantId }).select("+razorpayWebhookSecretEnc");
  if (!s?.razorpayWebhookSecretEnc) return res.status(404).json({ success: false });
  let secret;
  try {
    secret = decrypt(s.razorpayWebhookSecretEnc);
  } catch {
    return res.status(404).json({ success: false });
  }
  if (!sameSig(secret, raw, req.get("X-Razorpay-Signature"))) return res.status(400).json({ success: false, message: "Bad signature" });

  let evt;
  try {
    evt = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false });
  }
  if (evt.created_at && Date.now() - evt.created_at * 1000 > MAX_AGE_MS * 7) return res.json({ success: true, ignored: "old" });

  if (String(evt.event).startsWith("subscription.")) {
    const out = await require("./autopay").onEvent(tenantId, evt);
    return res.json({ success: true, handled: out });
  }

  const p = evt?.payload?.payment?.entity;
  if (!["payment.captured", "order.paid"].includes(evt.event) || !p || p.status !== "captured") {
    return res.json({ success: true, ignored: evt.event }); // acknowledge, so Razorpay stops retrying
  }
  const invoiceId = p.notes?.invoiceId;
  if (!invoiceId || !/^[a-f0-9]{24}$/i.test(String(invoiceId))) return res.json({ success: true, ignored: "no-invoice" });

  const inv = await Invoice.findOne({ _id: invoiceId, tenantId });
  if (!inv) return res.json({ success: true, ignored: "unknown-invoice" });

  let updated;
  try {
    updated = await recordPayment(tenantId, inv._id, {
      amount: p.amount / 100,
      method: "online",
      reference: p.id,
      idempotencyKey: `rzp:${p.id}`,
      note: "Paid online (confirmed by Razorpay webhook)",
    });
  } catch (e) {
    // e.g. the invoice was already settled at the desk: money arrived but can't be booked. Needs a human (refund).
    console.error("[razorpay-webhook] payment", p.id, "not booked:", e.message);
    return res.json({ success: true, ignored: "not-booked" });
  }
  if (!owing(updated)) {
    await PaymentLink.updateOne({ invoiceId: inv._id, tenantId, status: "pending" }, { status: "paid", paidAt: new Date() });
  }
  res.json({ success: true });
}

module.exports = (req, res, next) => handle(req, res).catch(next);
module.exports.sameSig = sameSig;
