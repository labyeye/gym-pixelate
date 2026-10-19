const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    userName: { type: String, default: "System" },
    userEmail: { type: String, default: "" },
    userRole: { type: String, default: "" },

    action: {
      type: String,
      required: true,
      enum: [
        "LOGIN",
        "LOGIN_FAILED",
        "LOGOUT",
        "REGISTER",
        "CREATE",
        "UPDATE",
        "DELETE",
        "NOTE_ADDED",
        "LEAD_CONVERTED",
        "PASSWORD_CHANGED",
        "PROFILE_UPDATED",
        "CHECKIN",
        "CHECKOUT",
        "FACE_REGISTERED",
        "PAYMENT",
        "REFUND",
        "FREEZE",
        "CANCEL",
      ],
    },

    module: {
      type: String,
      enum: [
        "Auth",
        "User",
        "Branch",
        "Member",
        "FollowUp",
        "MembershipPlan",
        "Membership",
        "Attendance",
        "Invoice",
        "Trainer",
        "Face",
        "Enquiry",
        "Class",
        "PersonalTraining",
        "Plan",
        "Locker",
        "Product",
        "Expense",
        "Coupon",
        "Announcement",
        "Equipment",
        "Measurement",
        "Report",
        "Staff",
      ],
    },

    description: { type: String },

    targetId: { type: String },

    ip: { type: String },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },

    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

activityLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 },
);
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ user: 1 });
activityLogSchema.index({ module: 1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
