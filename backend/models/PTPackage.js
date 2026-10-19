const mongoose = require("mongoose");

// A personal-training package SOLD to a member (N sessions with one trainer), with a session log.
const sessionSchema = new mongoose.Schema({
  scheduledAt: { type: Date, required: true },
  durationMin: { type: Number, default: 60 },
  status: {
    type: String,
    enum: ["scheduled", "completed", "missed", "cancelled"],
    default: "scheduled",
  },
  notes: { type: String, trim: true },
  completedAt: Date,
});

const ptPackageSchema = new mongoose.Schema(
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
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, default: "Personal Training", trim: true },
    totalSessions: { type: Number, required: true, min: 1 },
    pricePerSession: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 }, // trainer's cut of totalAmount
    validTill: { type: Date },
    status: {
      type: String,
      enum: ["active", "completed", "expired", "cancelled"],
      default: "active",
    },
    sessions: [sessionSchema],
  },
  { timestamps: true },
);

ptPackageSchema.virtual("completedSessions").get(function () {
  return (this.sessions || []).filter((s) => s.status === "completed").length;
});
ptPackageSchema.virtual("remainingSessions").get(function () {
  const used = (this.sessions || []).filter(
    (s) => s.status === "completed" || s.status === "missed",
  ).length;
  return Math.max(0, this.totalSessions - used);
});
ptPackageSchema.set("toJSON", { virtuals: true });
ptPackageSchema.set("toObject", { virtuals: true });

ptPackageSchema.index({ tenantId: 1, trainerId: 1, status: 1 });
ptPackageSchema.index({ memberId: 1 });

module.exports = mongoose.model("PTPackage", ptPackageSchema);
