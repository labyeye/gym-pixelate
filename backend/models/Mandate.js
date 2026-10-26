const mongoose = require("mongoose");

// Auto-renew mandate: a Razorpay Subscription on the GYM's own account (UPI AutoPay / card / eNACH).
// The member authorises once through `shortUrl`; each `subscription.charged` webhook renews the membership.
const mandateSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    membershipId: { type: mongoose.Schema.Types.ObjectId, ref: "Membership" }, // the membership it renews from
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "MembershipPlan", required: true },
    amount: { type: Number, required: true }, // rupees per cycle, GST included
    razorpayPlanId: String,
    razorpaySubscriptionId: { type: String, required: true },
    shortUrl: String,
    status: {
      type: String,
      enum: ["created", "authenticated", "active", "paused", "halted", "cancelled", "completed"],
      default: "created",
    },
    chargesCount: { type: Number, default: 0 },
    lastChargeAt: Date,
    lastPaymentId: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
mandateSchema.index({ razorpaySubscriptionId: 1 }, { unique: true });

module.exports = mongoose.models.Mandate || mongoose.model("Mandate", mandateSchema);
