const mongoose = require("mongoose");

const membershipPlanSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    name: {
      type: String,
      required: [true, "Please add a plan name"],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "half_yearly",
        "annual",
        "corporate",
        "custom",
      ],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "gym",
        "cardio",
        "crossfit",
        "yoga",
        "zumba",
        "personal_training",
        "combo",
        "other",
      ],
      default: "gym",
    },
    description: { type: String, trim: true },
    durationDays: {
      type: Number,
      required: [true, "Please add plan duration in days"],
      min: 1,
    },
    price: { type: Number, required: [true, "Please add a price"], min: 0 },
    admissionFee: { type: Number, default: 0, min: 0 }, // one-time joining fee, charged for new members
    gstPercent: { type: Number, default: 18, min: 0, max: 28 },
    priceIncludesGst: { type: Boolean, default: false },
    // what the plan lets the member do
    includes: {
      gymAccess: { type: Boolean, default: true },
      classes: { type: Boolean, default: false },
      classCreditsPerMonth: { type: Number, default: 0 }, // 0 + classes=true => unlimited
      ptSessions: { type: Number, default: 0 },
      locker: { type: Boolean, default: false },
      steamSauna: { type: Boolean, default: false },
      dietConsult: { type: Boolean, default: false },
    },
    accessHours: {
      from: { type: String, default: "" },
      to: { type: String, default: "" },
    }, // "06:00".."11:00" off-peak plans
    maxVisitsPerDay: { type: Number, default: 1 },
    freezeAllowedDays: { type: Number, default: 0 }, // total pause days permitted per membership
    maxFreezes: { type: Number, default: 1 },
    transferable: { type: Boolean, default: false },
    gracePeriodDays: { type: Number, default: 0 }, // entry allowed this many days after expiry
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

membershipPlanSchema.index({ tenantId: 1, branchId: 1 });

module.exports = mongoose.model("MembershipPlan", membershipPlanSchema);
