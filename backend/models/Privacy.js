const mongoose = require("mongoose");
const T = { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true };

// DPDP: append-only record of what a person agreed to and when.
const consentLogSchema = new mongoose.Schema(
  {
    tenantId: T,
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    purpose: { type: String, enum: ["data_processing", "marketing", "whatsapp", "health_data", "photo"], required: true },
    granted: { type: Boolean, required: true },
    source: { type: String, default: "staff" }, // staff | portal | waiver | erasure
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The gym's current liability waiver / PAR-Q text. Editing the text bumps `version`.
const waiverTemplateSchema = new mongoose.Schema(
  {
    tenantId: { ...T, unique: true },
    title: { type: String, default: "Liability waiver" },
    body: { type: String, required: true, maxlength: 20000 },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

// One row per signature; keeps the exact text that was signed so later edits don't rewrite history.
const signedWaiverSchema = new mongoose.Schema(
  {
    tenantId: T,
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    version: { type: Number, required: true },
    bodySnapshot: { type: String, required: true },
    signedName: { type: String, required: true, trim: true, maxlength: 120 },
    method: { type: String, enum: ["in_person", "portal"], default: "in_person" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const m = (n, s) => mongoose.models[n] || mongoose.model(n, s);
module.exports = {
  ConsentLog: m("ConsentLog", consentLogSchema),
  WaiverTemplate: m("WaiverTemplate", waiverTemplateSchema),
  SignedWaiver: m("SignedWaiver", signedWaiverSchema),
};
