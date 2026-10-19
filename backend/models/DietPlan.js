const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    slot: {
      type: String,
      enum: [
        "early_morning",
        "breakfast",
        "mid_morning",
        "lunch",
        "evening_snack",
        "pre_workout",
        "post_workout",
        "dinner",
        "bedtime",
      ],
      required: true,
    },
    time: { type: String },
    items: { type: String, required: true, trim: true }, // "2 egg whites, 1 roti, dal"
    calories: { type: Number },
    proteinG: { type: Number },
    carbsG: { type: Number },
    fatG: { type: Number },
  },
  { _id: false },
);

const dietPlanSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ["veg", "non_veg", "eggetarian", "vegan", "jain"],
      default: "veg",
    },
    goal: {
      type: String,
      enum: ["weight_loss", "muscle_gain", "maintenance", "general_health", ""],
      default: "",
    },
    targetCalories: { type: Number },
    targetProteinG: { type: Number },
    waterLitres: { type: Number, default: 3 },
    meals: [mealSchema],
    supplements: { type: String, trim: true },
    avoid: { type: String, trim: true },
    isTemplate: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true },
);
dietPlanSchema.index({ tenantId: 1, memberId: 1, status: 1 });

module.exports = mongoose.model("DietPlan", dietPlanSchema);
