const mongoose = require("mongoose");

// One WhatsApp payment link per outstanding invoice. The public /pay/:token page uses
// `token` as its only credential, so it is random, unguessable and expires.
const paymentLinkSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    token: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid", "expired"], default: "pending" },
    expiresAt: { type: Date, required: true },
    paidAt: { type: Date },
    // Razorpay order for the attempt in progress.
    orderId: { type: String },
    // WhatsApp delivery bookkeeping. lastSentMonth ("YYYY-MM", IST) makes the monthly send idempotent.
    sentAt: { type: Date },
    lastSentMonth: { type: String },
    sendAttempts: { type: Number, default: 0 },
    lastError: { type: String },
  },
  { timestamps: true },
);

paymentLinkSchema.index({ invoiceId: 1 }, { unique: true });

module.exports = mongoose.model("PaymentLink", paymentLinkSchema);
