const asyncHandler = require("express-async-handler");
const Branch = require("../models/Branch");
const logActivity = require("../utils/activityLogger");
const { assertCapacity } = require("../utils/gym");

const getBranches = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;

  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { city: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [branches, total] = await Promise.all([
    Branch.find(query).sort("-createdAt").skip(skip).limit(parseInt(limit)),
    Branch.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: branches.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: branches,
  });
});

const getBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }

  res.json({ success: true, data: branch });
});

const createBranch = asyncHandler(async (req, res) => {
  if (req.user.tenantId) await assertCapacity(req.user.tenantId, "branches");
  const branch = await Branch.create({
    ...req.body,
    tenantId: req.user.tenantId || null,
  });

  logActivity({
    user: req.user,
    action: "CREATE",
    module: "Branch",
    description: `Created branch: ${branch.name}`,
    targetId: branch._id,
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: branch });
});

const updateBranch = asyncHandler(async (req, res) => {
  let branch = await Branch.findById(req.params.id);

  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }

  branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "Branch",
    description: `Updated branch: ${branch.name}`,
    targetId: branch._id,
    ip: req.ip,
  });

  res.json({ success: true, data: branch });
});

const deleteBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }

  await Branch.findByIdAndDelete(req.params.id);

  logActivity({
    user: req.user,
    action: "DELETE",
    module: "Branch",
    description: `Deleted branch: ${branch.name}`,
    targetId: branch._id,
    ip: req.ip,
  });

  res.json({ success: true, message: "Branch deleted successfully" });
});

module.exports = {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
};
