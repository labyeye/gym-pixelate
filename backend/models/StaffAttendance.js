const mongoose = require("mongoose");

// One row per staff member per calendar day (IST day start).
const staffAttendanceSchema = new mongoose.Schema(
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "present",
        "absent",
        "half_day",
        "paid_leave",
        "unpaid_leave",
        "weekly_off",
        "holiday",
      ],
      required: true,
    },
    checkIn: { type: String }, // "HH:mm"
    checkOut: { type: String },
    note: { type: String, trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

staffAttendanceSchema.index(
  { tenantId: 1, userId: 1, date: 1 },
  { unique: true },
);
staffAttendanceSchema.index({ tenantId: 1, date: 1 });

module.exports = mongoose.model("StaffAttendance", staffAttendanceSchema);
