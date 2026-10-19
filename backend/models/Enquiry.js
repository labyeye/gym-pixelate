const mongoose = require("mongoose");

// Walk-in / call / social enquiry -> free trial -> joined. The gym's sales pipeline.
const enquirySchema = new mongoose.Schema(
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
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },
    goal: { type: String, trim: true },
    interestedPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MembershipPlan",
      default: null,
    },
    source: {
      type: String,
      enum: [
        "walk_in",
        "call",
        "referral",
        "instagram",
        "facebook",
        "google",
        "website",
        "whatsapp",
        "poster",
        "other",
      ],
      default: "walk_in",
    },
    status: {
      type: String,
      enum: [
        "new",
        "contacted",
        "trial_booked",
        "trial_done",
        "negotiating",
        "converted",
        "lost",
      ],
      default: "new",
    },
    lostReason: {
      type: String,
      enum: [
        "price",
        "location",
        "timing",
        "joined_other_gym",
        "not_interested",
        "no_response",
        "other",
        "",
      ],
      default: "",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    followUpAt: { type: Date },
    trial: {
      date: Date,
      slot: String,
      attended: { type: Boolean, default: false },
    },
    notes: [
      { text: String, by: String, at: { type: Date, default: Date.now } },
    ],
    convertedMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
  },
  { timestamps: true },
);

enquirySchema.index({ tenantId: 1, status: 1, followUpAt: 1 });
enquirySchema.index({ tenantId: 1, phone: 1 });

module.exports = mongoose.model("Enquiry", enquirySchema);
