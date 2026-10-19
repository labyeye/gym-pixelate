const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const logActivity = require("../utils/activityLogger");
const { assertCapacity, nextCode, fail } = require("../utils/gym");
const TrainerAssignment = require("../models/TrainerAssignment");
const PTPackage = require("../models/PTPackage");

const getUsers = asyncHandler(async (req, res) => {
  const { status, role, search } = req.query;

  const query = {};

  if (req.user.tenantId) query.tenantId = req.user.tenantId;

  if (status) query.status = status;
  query.role = role || { $ne: "member" }; // portal logins are managed from the member profile, not the staff list
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(query).sort("-createdAt");

  res.json({
    success: true,
    count: users.length,
    data: users,
  });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.json({
    success: true,
    data: user,
  });
});

const createUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    phone,
    department,
    avatar,
    branchId,
    trainerProfile,
    monthlySalary,
  } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User with this email already exists");
  }

  // nobody may mint accounts above their own level (e.g. a manager creating an owner / super_admin)
  const target = role || "receptionist";
  const allowedRole =
    req.user.role === "super_admin"
      ? true
      : req.user.role === "gym_owner"
        ? target !== "super_admin"
        : !["super_admin", "gym_owner", "branch_manager"].includes(target);
  if (!allowedRole)
    throw fail(403, "You can't create an account with that role");
  if (req.user.tenantId) await assertCapacity(req.user.tenantId, "staff");
  const employeeId = req.user.tenantId
    ? await nextCode(req.user.tenantId, "employee", "EMP", 3)
    : undefined;

  const user = await User.create({
    name,
    email,
    password,
    role: role || "receptionist",
    phone,
    department,
    avatar: avatar || undefined,
    employeeId,
    trainerProfile,
    monthlySalary: Number(monthlySalary) || 0,
    branchId: branchId || null,
    tenantId: req.user.tenantId || null,
  });

  logActivity({
    user: req.user,
    action: "CREATE",
    module: "User",
    description: `Admin ${req.user.name} created user: ${user.name} (${user.role})`,
    targetId: user._id,
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      department: user.department,
      avatar: user.avatar,
      employeeId: user.employeeId,
      status: user.status,
      branchId: user.branchId,
    },
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.role === "super_admin" && req.user.role !== "super_admin") {
    res.status(403);
    throw new Error("Cannot modify super admin account");
  }

  const {
    name,
    email,
    password,
    role,
    phone,
    department,
    status,
    branchId,
    avatar,
    trainerProfile,
    monthlySalary,
  } = req.body;

  if (name) user.name = name;
  if (email) user.email = email;
  if (password) user.password = password;
  if (role && ["super_admin", "gym_owner"].includes(req.user.role)) {
    // an owner may re-role their staff, but never mint a platform admin
    if (role === "super_admin" && req.user.role !== "super_admin")
      throw fail(403, "You can't assign that role");
    user.role = role;
  }
  if (trainerProfile !== undefined) user.trainerProfile = trainerProfile;
  if (monthlySalary !== undefined)
    user.monthlySalary = Number(monthlySalary) || 0;
  if (phone !== undefined) user.phone = phone;
  if (department !== undefined) user.department = department;
  if (status) user.status = status;
  if (branchId !== undefined) user.branchId = branchId;
  if (avatar !== undefined) user.avatar = avatar;

  const updated = await user.save();

  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "User",
    description: `Admin ${req.user.name} updated user: ${updated.name}`,
    targetId: updated._id,
    ip: req.ip,
  });

  res.json({
    success: true,
    data: updated,
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user._id.toString() === req.user._id.toString()) {
    res.status(403);
    throw new Error("Cannot deactivate your own account");
  }

  if (user.role === "super_admin" && req.user.role !== "super_admin") {
    res.status(403);
    throw new Error("Only a super admin can remove another super admin");
  }

  const history =
    (await TrainerAssignment.exists({ trainerId: user._id })) ||
    (await PTPackage.exists({ trainerId: user._id }));
  if (history) {
    user.status = "inactive";
    await user.save({ validateBeforeSave: false });
    return res.json({
      success: true,
      message:
        "This user has training history, so the account was deactivated instead of deleted",
      deactivated: true,
    });
  }
  await User.findByIdAndDelete(user._id);

  logActivity({
    user: req.user,
    action: "DELETE",
    module: "User",
    description: `Admin ${req.user.name} deleted user: ${user.name}`,
    targetId: user._id,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: "User deleted successfully",
  });
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
