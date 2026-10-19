const asyncHandler = require("express-async-handler");
const TrainerAssignment = require("../models/TrainerAssignment");
const logActivity = require("../utils/activityLogger");
const User = require("../models/User");
const Member = require("../models/Member");
const { fail } = require("../utils/gym");

const assignTrainer = asyncHandler(async (req, res) => {
  const { trainerId, memberId, branchId } = req.body;

  if (!trainerId || !memberId || !branchId) {
    res.status(400);
    throw new Error("trainerId, memberId and branchId are required");
  }

  const [trainer, member] = await Promise.all([
    User.findOne({ _id: trainerId, role: "trainer", status: "active" }),
    Member.findById(memberId),
  ]);
  if (!trainer) throw fail(404, "Active trainer not found");
  if (!member) throw fail(404, "Member not found");
  if (trainer.trainerProfile?.maxClients) {
    const load = await TrainerAssignment.countDocuments({
      trainerId,
      isActive: true,
    });
    if (load >= trainer.trainerProfile.maxClients)
      throw fail(
        409,
        `${trainer.name} already has ${load} clients (max ${trainer.trainerProfile.maxClients})`,
      );
  }
  let assignment;
  try {
    assignment = await TrainerAssignment.create({
      tenantId: req.user.tenantId,
      branchId,
      trainerId,
      memberId,
    });
  } catch (e) {
    if (e.code === 11000)
      throw fail(409, `${member.name} is already assigned to ${trainer.name}`);
    throw e;
  }

  logActivity({
    user: req.user,
    action: "CREATE",
    module: "Trainer",
    description: `Assigned trainer ${trainerId} to member ${memberId}`,
    targetId: assignment._id,
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: assignment });
});

const unassignTrainer = asyncHandler(async (req, res) => {
  const assignment = await TrainerAssignment.findById(req.params.id);

  if (!assignment) {
    res.status(404);
    throw new Error("Trainer assignment not found");
  }

  assignment.isActive = false;
  await assignment.save();

  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "Trainer",
    description: `Unassigned trainer assignment ${assignment._id}`,
    targetId: assignment._id,
    ip: req.ip,
  });

  res.json({ success: true, data: assignment });
});

const getTrainerMembers = asyncHandler(async (req, res) => {
  const { trainerId } = req.params;

  const query = { trainerId, isActive: true };
  if (req.user.tenantId) query.tenantId = req.user.tenantId;

  const assignments = await TrainerAssignment.find(query).populate(
    "memberId",
    "name email phone photo",
  );

  res.json({
    success: true,
    count: assignments.length,
    data: assignments,
  });
});

const getAssignments = asyncHandler(async (req, res) => {
  const { branchId, memberId, trainerId, page = 1, limit = 50 } = req.query;

  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (branchId) query.branchId = branchId;
  if (memberId) query.memberId = memberId;
  if (trainerId) query.trainerId = trainerId;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [assignments, total] = await Promise.all([
    TrainerAssignment.find(query)
      .populate("trainerId", "name email")
      .populate("memberId", "name email phone")
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit)),
    TrainerAssignment.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: assignments.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: assignments,
  });
});

module.exports = {
  assignTrainer,
  unassignTrainer,
  getTrainerMembers,
  getAssignments,
};
