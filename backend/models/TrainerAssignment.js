const mongoose = require("mongoose");

const trainerAssignmentSchema = new mongoose.Schema(
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
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    assignedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

trainerAssignmentSchema.index({ tenantId: 1, branchId: 1 });
trainerAssignmentSchema.index({ trainerId: 1 });
// one live assignment per (trainer, member); unassigned rows are history
trainerAssignmentSchema.index(
  { trainerId: 1, memberId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

module.exports = mongoose.model("TrainerAssignment", trainerAssignmentSchema);
