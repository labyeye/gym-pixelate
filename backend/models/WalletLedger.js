const mongoose = require("mongoose");

// Member wallet history (referral rewards, manual credits, money spent on invoices). Member.walletBalance is the
// running total; this is the audit trail. `refKey` makes an automatic credit happen once only.
const walletLedgerSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    amount: { type: Number, required: true }, // + credit, - debit (rupees)
    reason: { type: String, enum: ["referral", "manual", "redeem", "refund"], required: true },
    note: { type: String, trim: true, maxlength: 200 },
    refKey: String,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
walletLedgerSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });
walletLedgerSchema.index({ tenantId: 1, refKey: 1 }, { unique: true, partialFilterExpression: { refKey: { $type: "string" } } });

module.exports = mongoose.models.WalletLedger || mongoose.model("WalletLedger", walletLedgerSchema);
