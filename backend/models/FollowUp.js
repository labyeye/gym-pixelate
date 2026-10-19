const mongoose = require("mongoose");

// One staff contact attempt about a member or an enquiry (renewal call, win-back, dues chase, trial follow-up).
const followUpSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
    enquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enquiry",
      default: null,
    },
    kind: {
      type: String,
      enum: [
        "renewal",
        "lapsed",
        "dues",
        "trial",
        "pt_renewal",
        "at_risk",
        "other",
      ],
      default: "other",
    },
    outcome: {
      type: String,
      enum: [
        "contacted",
        "interested",
        "no_answer",
        "unavailable",
        "returning",
        "renewed",
        "not_interested",
      ],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 500 },
    nextFollowUpAt: { type: Date, default: null }, // hides the item from the worklist until then
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    byName: { type: String },
  },
  { timestamps: true },
);

followUpSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });
followUpSchema.index({ tenantId: 1, enquiryId: 1, createdAt: -1 });

module.exports = mongoose.model("FollowUp", followUpSchema);
