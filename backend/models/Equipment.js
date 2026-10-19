const mongoose = require("mongoose");

const equipmentSchema = new mongoose.Schema(
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
        "cardio",
        "strength",
        "free_weights",
        "functional",
        "accessory",
        "other",
      ],
      default: "strength",
    },
    code: { type: String, trim: true },
    photo: { type: String },
    vendor: { type: String, trim: true },
    brand: { type: String, trim: true },
    serialNo: { type: String, trim: true },
    purchasedOn: Date,
    purchaseCost: { type: Number, default: 0 },
    warrantyTill: Date,
    status: {
      type: String,
      enum: ["working", "under_maintenance", "out_of_order", "retired"],
      default: "working",
    },
    serviceEveryDays: { type: Number, default: 90 },
    lastServiceOn: Date,
    nextServiceOn: Date,
    serviceLog: [{ on: Date, note: String, cost: Number, by: String }],
  },
  { timestamps: true },
);
equipmentSchema.index({ tenantId: 1, branchId: 1, status: 1 });
equipmentSchema.index({ tenantId: 1, nextServiceOn: 1 });

module.exports = mongoose.model("Equipment", equipmentSchema);
