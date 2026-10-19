const mongoose = require("mongoose");

// Recurring group class (Zumba, Yoga, HIIT, Spin...). Concrete sessions are ClassBooking.sessionDate.
const gymClassSchema = new mongoose.Schema(
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
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "yoga",
        "zumba",
        "hiit",
        "crossfit",
        "spin",
        "pilates",
        "aerobics",
        "martial_arts",
        "dance",
        "other",
      ],
      default: "other",
    },
    description: { type: String, trim: true },
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    room: { type: String, trim: true },
    capacity: { type: Number, default: 20, min: 1 },
    durationMin: { type: Number, default: 60, min: 5 },
    // weekly schedule: days 0=Sun..6=Sat, start "HH:mm"
    schedule: [
      { day: { type: Number, min: 0, max: 6 }, start: { type: String } },
    ],
    dropInPrice: { type: Number, default: 0 },
    creditsRequired: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
gymClassSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });

module.exports = mongoose.model("GymClass", gymClassSchema);
