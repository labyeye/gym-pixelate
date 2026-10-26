const mongoose = require("mongoose");

// A payment we received but could not turn into a subscription / bill. Created by utils/paymentSaga.js
// and kept until the money is back with the customer.
const paymentIncidentSchema = new mongoose.Schema(
  {
    gateway: { type: String, required: true, enum: ["razorpay"] },
    paymentId: { type: String, required: true },
    orderId: { type: String },
    amount: { type: Number }, // rupees
    product: { type: String }, // what they were buying, e.g. "NestHR Growth (yearly)"
    ownerId: { type: mongoose.Schema.Types.ObjectId }, // company / tenant
    userId: { type: mongoose.Schema.Types.ObjectId },
    failureReason: { type: String },
    rolledBack: [String], // steps that were undone
    status: {
      type: String,
      enum: ["refund_pending", "refund_initiated", "refunded", "needs_manual"],
      default: "refund_pending",
    },
    refundId: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    emailedAt: { type: Date },
  },
  { timestamps: true },
);
paymentIncidentSchema.index({ gateway: 1, paymentId: 1 }, { unique: true });
paymentIncidentSchema.index({ status: 1, attempts: 1 });

module.exports = mongoose.model("PaymentIncident", paymentIncidentSchema);
