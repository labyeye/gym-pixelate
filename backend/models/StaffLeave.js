const mongoose = require("mongoose");

// Staff / trainer leave request (copied from NestHR's Leave, trimmed: no payroll fields). Approving it marks the days on StaffAttendance.
const staffLeaveSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    leaveType: {
      type: String,
      enum: [
        "casual",
        "sick",
        "earned",
        "maternity",
        "paternity",
        "compensatory",
        "unpaid",
      ],
      required: true,
    },
    startDate: { type: Date, required: true }, // IST day start
    endDate: { type: Date, required: true }, // IST day start
    days: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    isHalfDay: { type: Boolean, default: false },
    halfDayType: { type: String, enum: ["first_half", "second_half"] },
    paid: { type: Boolean }, // decided at approval: paid leave or unpaid (unpaid type is always unpaid)
    cancellationReason: { type: String, trim: true, maxlength: 300 },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    rejectionReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);
staffLeaveSchema.index({ tenantId: 1, userId: 1, startDate: -1 });
staffLeaveSchema.index({ tenantId: 1, status: 1 });

module.exports =
  mongoose.models.StaffLeave || mongoose.model("StaffLeave", staffLeaveSchema);
