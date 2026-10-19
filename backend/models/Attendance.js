const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
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
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Membership",
      default: null,
    },
    checkinAt: { type: Date, default: Date.now },
    checkoutAt: { type: Date, default: null },
    method: {
      type: String,
      enum: ["face", "manual", "qr", "card"],
      default: "manual",
    },
    confidence: { type: Number, default: null },
    durationMin: { type: Number, default: null },
    autoCheckout: { type: Boolean, default: false }, // forgot to tap out; closed by the nightly sweep
    overrideReason: { type: String, trim: true }, // reception let an expired/due member in
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

attendanceSchema.index({ tenantId: 1, branchId: 1, checkinAt: -1 });
attendanceSchema.index({ memberId: 1, checkinAt: -1 });
// a member can only be "inside" once -> double scans cannot create two open visits
attendanceSchema.index(
  { memberId: 1 },
  {
    unique: true,
    partialFilterExpression: { checkoutAt: null },
    name: "one_open_visit_per_member",
  },
);

module.exports = mongoose.model("Attendance", attendanceSchema);
