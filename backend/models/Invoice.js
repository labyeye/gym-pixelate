const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [
        "membership",
        "admission",
        "pt_package",
        "product",
        "locker",
        "class",
        "other",
      ],
      default: "other",
    },
    refId: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }, // qty * unitPrice (pre-GST)
  },
  { _id: false },
);

// One row per collection of money. Append-only: refunds are negative rows, never deletes.
const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  method: {
    type: String,
    enum: [
      "cash",
      "card",
      "upi",
      "online",
      "bank_transfer",
      "cheque",
      "wallet",
    ],
    default: "cash",
  },
  reference: { type: String, trim: true }, // UPI txn id, cheque no...
  paidAt: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  idempotencyKey: { type: String },
  note: { type: String, trim: true },
  type: { type: String, enum: ["payment", "refund"], default: "payment" },
});

const invoiceSchema = new mongoose.Schema(
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
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    }, // null = walk-in POS sale
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Membership",
      default: null,
    },
    invoiceNumber: { type: String, required: true },
    items: [itemSchema],
    amount: { type: Number, required: true }, // taxable subtotal (after discount)
    discount: { type: Number, default: 0 },
    couponCode: { type: String, trim: true },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    payments: [paymentSchema],
    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "card",
        "upi",
        "online",
        "bank_transfer",
        "cheque",
        "wallet",
      ],
      default: "cash",
    }, // last used
    status: {
      type: String,
      enum: ["paid", "partial", "pending", "refunded", "cancelled"],
      default: "paid",
    },
    dueDate: { type: Date },
    issuedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    idempotencyKey: { type: String },
  },
  { timestamps: true },
);

invoiceSchema.virtual("balance").get(function () {
  return Math.max(0, (this.totalAmount || 0) - (this.paidAmount || 0));
});
invoiceSchema.set("toJSON", { virtuals: true });
invoiceSchema.set("toObject", { virtuals: true });

// invoice numbers repeat across gyms, so uniqueness is per tenant (was global -> 2nd gym broke)
invoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, branchId: 1, issuedAt: -1 });
invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
invoiceSchema.index({ memberId: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
