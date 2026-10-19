const mongoose = require("mongoose");

// Stock bought from a vendor: ordered -> received (GRN issued, stock added). The vendor's bill is uploaded as a file.
const purchaseSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
    poNumber: { type: String, required: true },
    grnNumber: { type: String },
    vendor: { type: String, required: true, trim: true },
    vendorPhone: { type: String, trim: true },
    billNumber: { type: String, trim: true },
    billDate: Date,
    billFile: { type: String }, // uploaded vendor bill (pdf / photo)
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: String,
        sku: String,
        quantity: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, required: true, min: 0 },
        gstPercent: { type: Number, default: 0 },
        _id: false,
      },
    ],
    subtotal: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["ordered", "received", "cancelled"], default: "ordered" },
    receivedOn: Date,
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
purchaseSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
purchaseSchema.index({ tenantId: 1, poNumber: 1 }, { unique: true });

module.exports = mongoose.model("Purchase", purchaseSchema);
