const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Please add a branch name"],
      trim: true,
    },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    phone: { type: String, trim: true },
    timing: {
      open: { type: String, default: "06:00" },
      close: { type: String, default: "22:00" },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

branchSchema.index({ tenantId: 1 });

module.exports = mongoose.model("Branch", branchSchema);
