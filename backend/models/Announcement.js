const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
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
    }, // null = all branches
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true },
    kind: {
      type: String,
      enum: ["notice", "holiday", "offer", "event", "maintenance"],
      default: "notice",
    },
    audience: {
      type: String,
      enum: ["all", "active_members", "expiring", "staff"],
      default: "all",
    },
    publishAt: { type: Date, default: Date.now },
    expiresAt: Date,
    pinned: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
announcementSchema.index({ tenantId: 1, publishAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
