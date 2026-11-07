const mongoose = require("mongoose");

// A ZKTeco / eSSL style biometric terminal that pushes punches to /iclock (ADMS protocol). Matched by serial number.
const attendanceDeviceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    serialNumber: { type: String, required: true, trim: true, unique: true }, // printed on the device; unique across gyms
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    }, // where the device is mounted
    model: { type: String, trim: true, maxlength: 40, default: "" },
    lastSeenAt: Date,
    lastLogAt: Date, // newest punch already processed; older or equal ones are resends and are skipped
    ip: String,
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.AttendanceDevice ||
  mongoose.model("AttendanceDevice", attendanceDeviceSchema);
