const mongoose = require("mongoose");

// Every automatic WhatsApp reminder we tried to send. The unique `refKey` is what stops a member getting
// the same reminder twice (e.g. "expiring:<membershipId>", "birthday:<memberId>:2026").
const notificationLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", index: true },
    kind: { type: String, enum: ["expiring", "expired", "birthday"], required: true },
    channel: { type: String, default: "whatsapp" },
    refKey: { type: String, required: true },
    status: { type: String, enum: ["sending", "sent", "failed"], default: "sending" },
    error: String,
  },
  { timestamps: true },
);
notificationLogSchema.index({ tenantId: 1, refKey: 1 }, { unique: true });
notificationLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.models.NotificationLog || mongoose.model("NotificationLog", notificationLogSchema);
