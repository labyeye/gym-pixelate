const mongoose = require("mongoose");

// Member satisfaction (NPS style, 0-10) left from the portal.
const feedbackSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    score: { type: Number, required: true, min: 0, max: 10 },
    comment: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
feedbackSchema.index({ tenantId: 1, createdAt: -1 });
feedbackSchema.index({ memberId: 1, createdAt: -1 });

module.exports = mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);
