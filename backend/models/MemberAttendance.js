const mongoose = require("mongoose");

// One row per member per IST day: when they walked in and out (desk check-in, optional module).
const memberAttendanceSchema = new mongoose.Schema(
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
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    date: { type: Date, required: true }, // IST day start
    checkIn: { type: String }, // "HH:mm"
    checkOut: { type: String },
    verifyMode: {
      type: String,
      enum: ["manual", "self", "geo", "face", "geo_camera", "biometric"],
      default: "manual",
    },
    checkInLocation: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      distanceMeters: Number,
    },
    checkOutLocation: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      distanceMeters: Number,
    },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
memberAttendanceSchema.index(
  { tenantId: 1, memberId: 1, date: 1 },
  { unique: true },
);
memberAttendanceSchema.index({ tenantId: 1, date: 1 });

module.exports =
  mongoose.models.MemberAttendance ||
  mongoose.model("MemberAttendance", memberAttendanceSchema);
