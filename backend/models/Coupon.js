const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ["percent", "flat"], default: "percent" },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: 0 }, // cap for percent coupons, 0 = no cap
    minAmount: { type: Number, default: 0 },
    validFrom: Date,
    validTill: Date,
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
couponSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Coupon", couponSchema);
