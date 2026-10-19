const mongoose = require("mongoose");

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    muscleGroup: {
      type: String,
      enum: [
        "chest",
        "back",
        "shoulders",
        "biceps",
        "triceps",
        "legs",
        "glutes",
        "core",
        "cardio",
        "full_body",
        "other",
      ],
      default: "other",
    },
    sets: { type: Number, default: 3 },
    reps: { type: String, default: "10" }, // "8-12", "AMRAP", "30s"
    restSec: { type: Number, default: 60 },
    weightKg: { type: Number },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

// Template (memberId null) reusable across members, or assigned to one member.
const workoutPlanSchema = new mongoose.Schema(
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
      default: null,
    },
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: { type: String, required: true, trim: true },
    goal: {
      type: String,
      enum: [
        "weight_loss",
        "muscle_gain",
        "strength",
        "endurance",
        "flexibility",
        "general_fitness",
        "rehab",
        "",
      ],
      default: "",
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", ""],
      default: "",
    },
    weeks: { type: Number, default: 4 },
    days: [
      {
        label: { type: String, required: true },
        focus: String,
        exercises: [exerciseSchema],
      },
    ], // "Day 1 - Push"
    startsOn: Date,
    isTemplate: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "completed", "archived"],
      default: "active",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
workoutPlanSchema.index({ tenantId: 1, memberId: 1, status: 1 });
workoutPlanSchema.index({ tenantId: 1, isTemplate: 1 });

module.exports = mongoose.model("WorkoutPlan", workoutPlanSchema);
