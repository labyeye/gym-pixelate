const mongoose = require("mongoose");

const membershipSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MembershipPlan",
      required: true,
    },
    planName: { type: String }, // snapshot, so renaming a plan doesn't rewrite history
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "active",
        "expired",
        "frozen",
        "upgraded",
        "cancelled",
        "upcoming",
      ],
      default: "active",
    },
    // money snapshot at time of sale (plan price may change later)
    price: { type: Number, default: 0 },
    admissionFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, trim: true },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    dueDate: { type: Date },
    isRenewal: { type: Boolean, default: false },
    previousMembershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Membership",
      default: null,
    },
    soldBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    autoRenew: { type: Boolean, default: false },
    originalEndDate: { type: Date }, // end date before any freeze extension
    freezeDaysUsed: { type: Number, default: 0 },
    freezeHistory: [
      {
        from: Date,
        to: Date,
        reason: String,
        days: Number,
        endedAt: Date,
      },
    ],
    cancelledAt: Date,
    cancelReason: String,
    reminders: {
      sent7: Date,
      sent3: Date,
      sent0: Date,
      sentExpired: Date,
    },
  },
  { timestamps: true },
);

membershipSchema.virtual("dueAmount").get(function () {
  return Math.max(0, (this.totalAmount || 0) - (this.paidAmount || 0));
});
membershipSchema.set("toJSON", { virtuals: true });
membershipSchema.set("toObject", { virtuals: true });

membershipSchema.index({ tenantId: 1, branchId: 1 });
membershipSchema.index({ memberId: 1, status: 1 });
membershipSchema.index({ tenantId: 1, status: 1, endDate: 1 });

module.exports = mongoose.model("Membership", membershipSchema);
