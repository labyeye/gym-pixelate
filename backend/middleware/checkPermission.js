const asyncHandler = require("express-async-handler");
const Setting = require("../models/Setting");

const full = { create: true, read: true, update: true, delete: true };
const readOnly = { create: false, read: true, update: false, delete: false };
const none = { create: false, read: false, update: false, delete: false };

const DEFAULT_PERMISSIONS = {
  Members: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: readOnly,
    accountant: readOnly,
  },
  Memberships: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: readOnly,
    accountant: readOnly,
  },
  MembershipPlans: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: false },
    receptionist: readOnly,
    trainer: readOnly,
    accountant: readOnly,
  },
  Attendance: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: readOnly,
    accountant: none,
  },
  Invoices: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: false },
    receptionist: { create: true, read: true, update: false, delete: false },
    trainer: none,
    accountant: { create: true, read: true, update: true, delete: false },
  },
  Trainers: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: readOnly,
    trainer: readOnly,
    accountant: none,
  },
  Branches: {
    super_admin: full,
    gym_owner: full,
    branch_manager: readOnly,
    receptionist: readOnly,
    trainer: readOnly,
    accountant: readOnly,
  },
  Reports: {
    super_admin: full,
    gym_owner: full,
    branch_manager: readOnly,
    receptionist: none,
    trainer: none,
    accountant: readOnly,
  },
  Enquiries: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: none,
    accountant: none,
  },
  Classes: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: { create: true, read: true, update: true, delete: false },
    accountant: readOnly,
  },
  PersonalTraining: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: { create: true, read: true, update: true, delete: false },
    accountant: readOnly,
  },
  WorkoutPlans: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: readOnly,
    trainer: { create: true, read: true, update: true, delete: true },
    accountant: none,
  },
  Measurements: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: { create: true, read: true, update: true, delete: false },
    accountant: none,
  },
  Lockers: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: readOnly,
    accountant: readOnly,
  },
  Products: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: readOnly,
    accountant: { create: true, read: true, update: true, delete: false },
  },
  Expenses: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: false },
    receptionist: none,
    trainer: none,
    accountant: { create: true, read: true, update: true, delete: true },
  },
  Coupons: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: readOnly,
    trainer: none,
    accountant: readOnly,
  },
  Announcements: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: readOnly,
    accountant: readOnly,
  },
  Equipment: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: true },
    receptionist: { create: true, read: true, update: true, delete: false },
    trainer: { create: true, read: true, update: true, delete: false },
    accountant: readOnly,
  },
  Staff: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: false },
    receptionist: none,
    trainer: none,
    accountant: readOnly,
  },
  Users: {
    super_admin: full,
    gym_owner: full,
    branch_manager: { create: true, read: true, update: true, delete: false },
    receptionist: none,
    trainer: none,
    accountant: none,
  },
};

const permissionsCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

async function getTenantPermissions(tenantId) {
  const key = tenantId ? tenantId.toString() : "global";
  const cached = permissionsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const setting = await Setting.findOne({ tenantId: tenantId || null }).lean();
  const data = setting?.permissions || null;
  permissionsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function invalidatePermissionsCache(tenantId) {
  const key = tenantId ? tenantId.toString() : "global";
  permissionsCache.delete(key);
}

function checkPermission(resource, op) {
  return asyncHandler(async (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      res.status(401);
      throw new Error("Not authorized");
    }

    if (role === "super_admin") return next();

    const tenantPerms = await getTenantPermissions(req.user.tenantId);
    const matrix = tenantPerms || DEFAULT_PERMISSIONS;

    const resourcePerms = matrix[resource];
    if (!resourcePerms) {
      if (op === "read") return next();
      if (role === "gym_owner") return next();
      res.status(403);
      throw new Error("You do not have permission to perform this action");
    }

    const rolePerms = resourcePerms[role];
    if (!rolePerms || !rolePerms[op]) {
      res.status(403);
      throw new Error("You do not have permission to perform this action");
    }

    next();
  });
}

module.exports = {
  checkPermission,
  invalidatePermissionsCache,
  DEFAULT_PERMISSIONS,
};
