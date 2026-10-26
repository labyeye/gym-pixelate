const express = require("express");
const asyncHandler = require("express-async-handler");
const cfg = require("../config/credits");
const credits = require("../utils/credits");
const CreditLedger = require("../models/CreditLedger");
const CreditTopup = require("../models/CreditTopup");
const Setting = require("../models/Setting");
const Membership = require("../models/Membership");
const Member = require("../models/Member");
const Invoice = require("../models/Invoice");
const { protect, authorize } = require("../middleware/auth");
const router = express.Router();

const DAY = 86400000;
const view = authorize("gym_owner", "branch_manager");
const owner = authorize("gym_owner");

router.get("/balance", protect, view, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await credits.getBalance(req.user.tenantId) });
}));

router.get("/packs", protect, view, asyncHandler(async (req, res) => {
  const packs = cfg.PACKS.map((p) => {
    const gst = Math.round(p.price * cfg.GST_PCT) / 100;
    return { ...p, gst, total: p.price + gst, bonus: Math.max(p.credits - p.price, 0) };
  });
  res.json({ success: true, data: { packs, gstPct: cfg.GST_PCT, ratePerMessage: cfg.DEFAULT_RATE } });
}));

// Message list: what was charged, to whom, and what was skipped for lack of credits.
router.get("/ledger", protect, view, asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const filter = { tenantId: req.user.tenantId };
  if (["topup", "bonus", "debit", "refund", "skipped"].includes(req.query.type)) filter.type = req.query.type;
  const [rows, total] = await Promise.all([
    CreditLedger.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CreditLedger.countDocuments(filter),
  ]);
  res.json({
    success: true,
    total,
    page,
    data: rows.map((r) => ({ _id: r._id, type: r.type, credits: credits.toCredits(r.units), event: r.event, phone: r.phone, status: r.status, note: r.note, createdAt: r.createdAt })),
  });
}));

// What the automatic WhatsApp messages will cost, from what is on the books right now. Only the kinds the gym switched on count.
router.get("/estimate", protect, view, asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const s = await Setting.findOne({ tenantId }).select("reminders onlinePaymentsEnabled").lean();
  const on = s?.reminders || {};
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600000);
  const [expiring, expired, outstanding, birthdays] = await Promise.all([
    on.expiring ? Membership.countDocuments({ tenantId, status: "active", endDate: { $gt: now, $lte: new Date(now.getTime() + 3 * DAY) } }) : 0,
    on.expired ? Membership.countDocuments({ tenantId, status: "expired", endDate: { $gte: new Date(now.getTime() - 3 * DAY), $lte: now } }) : 0,
    s?.onlinePaymentsEnabled ? Invoice.countDocuments({ tenantId, status: { $in: ["pending", "partial"] }, memberId: { $ne: null } }) : 0,
    on.birthday
      ? Member.countDocuments({ tenantId, status: "active", dob: { $ne: null }, $expr: { $eq: [{ $month: "$dob" }, ist.getUTCMonth() + 1] } })
      : 0,
  ]);
  const r = cfg.DEFAULT_RATE;
  const rb = cfg.RATES.birthday ?? r;
  res.json({
    success: true,
    data: {
      expiringSoon: expiring,
      recentlyExpired: expired,
      outstandingInvoices: outstanding,
      birthdaysThisMonth: birthdays,
      credits: Math.round(((expiring + expired + outstanding) * r + birthdays * rb) * 100) / 100,
    },
  });
}));

router.post("/topup", protect, owner, asyncHandler(async (req, res) => {
  try {
    res.json({ success: true, data: await credits.createTopup(req.user, req.body.packId) });
  } catch (e) {
    res.status(e.status || 500);
    throw e;
  }
}));

router.post("/topup/verify", protect, owner, asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400);
    throw new Error("Missing payment details");
  }
  if (!credits.verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    res.status(400);
    throw new Error("Payment verification failed. Invalid signature.");
  }
  const order = await CreditTopup.findOne({ orderId: razorpayOrderId }).select("tenantId");
  if (!order || String(order.tenantId) !== String(req.user.tenantId)) {
    res.status(404);
    throw new Error("Order not found");
  }
  await credits.completeTopup({ orderId: razorpayOrderId, paymentId: razorpayPaymentId }); // null = webhook already did it
  res.json({ success: true, data: await credits.getBalance(req.user.tenantId) });
}));

router.get("/topups", protect, view, asyncHandler(async (req, res) => {
  const rows = await CreditTopup.find({ tenantId: req.user.tenantId, status: "paid" }).sort({ paidAt: -1 }).limit(50).lean();
  res.json({ success: true, data: rows.map((t) => ({ _id: t._id, invoiceNumber: t.invoiceNumber, credits: t.credits, price: t.price, gst: t.gst, total: t.total, paidAt: t.paidAt })) });
}));

module.exports = router;
