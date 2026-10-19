const mongoose = require("mongoose");

const classBookingSchema = new mongoose.Schema(
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
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GymClass",
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    sessionDate: { type: Date, required: true }, // exact start of the session
    status: {
      type: String,
      enum: ["booked", "waitlisted", "attended", "no_show", "cancelled"],
      default: "booked",
    },
    waitlistPosition: { type: Number, default: null },
    bookedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

classBookingSchema.index({ classId: 1, sessionDate: 1, status: 1 });
classBookingSchema.index({ memberId: 1, sessionDate: -1 });
// one live booking per member per session (cancelled rows may repeat)
classBookingSchema.index(
  { classId: 1, sessionDate: 1, memberId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["booked", "waitlisted", "attended"] },
    },
  },
);

module.exports = mongoose.model("ClassBooking", classBookingSchema);
