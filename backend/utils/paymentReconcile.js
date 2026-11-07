const crypto = require("crypto");
const PaymentEvent = require("../models/PaymentEvent");
const PaymentIncident = require("../models/PaymentIncident");

/*
 * Catches payments whose browser/app never called "verify" (tab closed, network dropped after paying).
 * Razorpay tells us through a webhook (RAZORPAY_WEBHOOK_SECRET); we store the event and, if nobody
 * activated the plan within WAIT_MS, activate it ourselves - or, if that fails, refund it (utils/paymentSaga.js).
 * One Razorpay account can serve several Nest products, so an event is only kept when the order is ours.
 */
const WAIT_MS = 3 * 60 * 1000;

// ---- this product's lookups (the only part that differs between apps)
const app = require("./paymentReconcileApp");

const sigOk = (secret, raw, given) => {
  const a = Buffer.from(
    crypto.createHmac("sha256", secret).update(raw).digest("hex"),
  );
  const b = Buffer.from(String(given || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** POST /api/webhooks/razorpay-billing  (needs the raw request bytes in req.body or req.rawBody) */
async function webhook(req, res) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const raw = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
    if (!secret || !raw)
      return res
        .status(503)
        .json({ success: false, message: "Webhook not configured" });
    if (!sigOk(secret, raw, req.get("X-Razorpay-Signature")))
      return res.status(400).json({ success: false, message: "Bad signature" });
    const ev = JSON.parse(raw.toString("utf8"));
    const p = ev?.payload?.payment?.entity;
    if (
      ["payment.captured", "order.paid"].includes(ev.event) &&
      p?.id &&
      p.order_id &&
      (await app.ownsOrder(p.order_id))
    ) {
      await PaymentEvent.updateOne(
        { gateway: "razorpay", paymentId: p.id },
        {
          $setOnInsert: {
            orderId: p.order_id,
            amount: (p.amount || 0) / 100,
            receivedAt: new Date(),
            status: "pending",
          },
        },
        { upsert: true },
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error("[PaymentReconcile] webhook:", e.message);
    res.status(500).json({ success: false });
  }
}

/** Runs every couple of minutes: activate (or refund) payments nobody verified. Safe to run on several workers. */
async function reconcile() {
  const events = await PaymentEvent.find({
    status: "pending",
    receivedAt: { $lte: new Date(Date.now() - WAIT_MS) },
    attempts: { $lt: 5 },
  }).limit(20);
  for (const ev of events) {
    // claim it, so two workers do not both provision the same payment
    const claimed = await PaymentEvent.findOneAndUpdate(
      { _id: ev._id, status: "pending", attempts: ev.attempts },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    if (!claimed) continue;
    try {
      if (
        await PaymentIncident.exists({
          gateway: "razorpay",
          paymentId: ev.paymentId,
        })
      ) {
        claimed.status = "done";
        claimed.note = "already refunded";
      } else if (await app.alreadyProvisioned(ev.paymentId)) {
        claimed.status = "done";
        claimed.note = "already activated";
      } else {
        await app.provision({
          orderId: ev.orderId,
          paymentId: ev.paymentId,
          amount: ev.amount,
        });
        claimed.status = "done";
        claimed.note = "activated from webhook";
      }
    } catch (e) {
      if (e.refund) {
        claimed.status = "done";
        claimed.note = "refunded: " + e.message.slice(0, 200);
      } else {
        claimed.lastError = e.message;
        if (claimed.attempts >= 5) claimed.status = "failed";
      }
    }
    await claimed.save();
  }
}

module.exports = { webhook, reconcile };
