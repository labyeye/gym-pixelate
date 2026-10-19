const mongoose = require("mongoose");

const lockerSchema = new mongoose.Schema(
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
    number: { type: String, required: true, trim: true },
    zone: { type: String, enum: ["men", "women", "unisex"], default: "unisex" },
    monthlyRent: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["available", "assigned", "maintenance"],
      default: "available",
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
    assignedOn: Date,
    validTill: Date,
  },
  { timestamps: true },
);
lockerSchema.index({ tenantId: 1, branchId: 1, number: 1 }, { unique: true });
lockerSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model("Locker", lockerSchema);
