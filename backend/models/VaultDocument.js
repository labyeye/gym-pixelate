const mongoose = require("mongoose");

// Metadata only. The file itself lives AES-256-GCM encrypted in backend/vault/<tenant>/<file>.enc (never served statically).
const schema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
    },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member" }, // whose document: a member...
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // ...or a trainer / staff member
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: {
      type: String,
      default: "other",
      enum: [
        "govt_id",
        "license",
        "gst",
        "agreement",
        "insurance",
        "id_proof",
        "medical",
        "invoice",
        "other",
      ],
    },
    file: { type: String, required: true }, // random name inside the tenant folder
    originalName: String,
    mime: String,
    size: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.VaultDocument || mongoose.model("VaultDocument", schema);
