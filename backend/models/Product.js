const mongoose = require("mongoose");

// Supplements / drinks / merchandise sold at the counter. stock only moves via atomic $inc.
const productSchema = new mongoose.Schema(
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
    sku: { type: String, trim: true },
    category: {
      type: String,
      enum: [
        "supplement",
        "beverage",
        "snack",
        "apparel",
        "accessory",
        "other",
      ],
      default: "supplement",
    },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    gstPercent: { type: Number, default: 18 },
    stock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
productSchema.index({ tenantId: 1, branchId: 1, isActive: 1 });

module.exports = mongoose.model("Product", productSchema);
