const mongoose = require("mongoose");

// What each biometric terminal sent and what we did with it (Biometric > Activity Logs). Kept 30 days.
const attendanceDeviceLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    serialNumber: { type: String, index: true },
    kind: {
      type: String,
      enum: ["handshake", "punches", "poll"],
      required: true,
    },
    ip: String,
    received: Number, // punch lines in the push
    marked: Number, // lines that became attendance
    skipped: Number, // already marked, unknown ID, module off, resend...
    detail: { type: String, maxlength: 600 },
    createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 3600 },
  },
  { versionKey: false },
);
attendanceDeviceLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports =
  mongoose.models.AttendanceDeviceLog ||
  mongoose.model("AttendanceDeviceLog", attendanceDeviceLogSchema);
