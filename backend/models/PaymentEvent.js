const mongoose = require("mongoose");

// A "payment captured" notice from the gateway webhook. It is only acted on a few minutes later (utils/paymentReconcile.js),
// so the customer's own browser/app gets the first chance to verify and activate the plan.
const paymentEventSchema = new mongoose.Schema(
  {
    gateway: { type: String, default: "razorpay" },
    paymentId: { type: String, required: true },
    orderId: { type: String, required: true },
    amount: { type: Number }, // rupees
    receivedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    note: { type: String },
    lastError: { type: String },
  },
  { timestamps: true },
);
paymentEventSchema.index({ gateway: 1, paymentId: 1 }, { unique: true });
paymentEventSchema.index({ status: 1, receivedAt: 1 });

module.exports = mongoose.model("PaymentEvent", paymentEventSchema);
