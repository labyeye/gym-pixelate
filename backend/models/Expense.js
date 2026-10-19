const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
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
    category: { type: String, required: true, trim: true, lowercase: true },
    amount: { type: Number, required: true, min: 0 },
    paidOn: { type: Date, default: Date.now },
    method: {
      type: String,
      enum: ["cash", "card", "upi", "bank_transfer", "cheque"],
      default: "cash",
    },
    vendor: { type: String, trim: true },
    description: { type: String, trim: true },
    receipt: { type: String },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
expenseSchema.index({ tenantId: 1, branchId: 1, paidOn: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
