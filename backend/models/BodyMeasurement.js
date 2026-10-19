const mongoose = require("mongoose");

// Progress tracking: weigh-in / InBody-style check. BMI is derived, never stored stale.
const bodyMeasurementSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    measuredAt: { type: Date, default: Date.now },
    weightKg: { type: Number, min: 0 },
    heightCm: { type: Number, min: 0 },
    bodyFatPct: { type: Number, min: 0, max: 80 },
    muscleMassKg: { type: Number, min: 0 },
    visceralFat: { type: Number, min: 0 },
    restingHr: { type: Number, min: 0 },
    bpSystolic: { type: Number, min: 0 },
    bpDiastolic: { type: Number, min: 0 },
    chestCm: Number,
    waistCm: Number,
    hipsCm: Number,
    armCm: Number,
    thighCm: Number,
    photos: [String],
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

bodyMeasurementSchema.virtual("bmi").get(function () {
  if (!this.weightKg || !this.heightCm) return null;
  const m = this.heightCm / 100;
  return Math.round((this.weightKg / (m * m)) * 10) / 10;
});
bodyMeasurementSchema.set("toJSON", { virtuals: true });
bodyMeasurementSchema.set("toObject", { virtuals: true });
bodyMeasurementSchema.index({ memberId: 1, measuredAt: -1 });

module.exports = mongoose.model("BodyMeasurement", bodyMeasurementSchema);
