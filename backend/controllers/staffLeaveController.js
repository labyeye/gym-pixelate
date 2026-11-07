const asyncHandler = require("express-async-handler");
const StaffAttendance = require("../models/StaffAttendance");
const StaffLeave = require("../models/StaffLeave");
const Setting = require("../models/Setting");
const User = require("../models/User");
const logActivity = require("../utils/activityLogger");
const { fail, istDay } = require("../utils/gym");
const hr = require("../utils/staffHr");

// Leave management for trainers and staff, modelled on NestHR's Leave page: yearly allowance per type (owner sets it),
// apply (self, or owner/manager on someone's behalf), half day, edit while pending, approve as paid or unpaid,
// reject with a reason, cancel with a reason (approved leave gives the marked days back). No payroll here.
const DAY = 86400000;
const TYPES = [
  "casual",
  "sick",
  "earned",
  "maternity",
  "paternity",
  "compensatory",
  "unpaid",
];
const DEFAULT_ALLOWANCE = {
  casual: 12,
  sick: 6,
  earned: 0,
  maternity: 0,
  paternity: 0,
  compensatory: 0,
}; // days per calendar year
const MAX_LEAVE_DAYS = 60;
const MANAGERS = ["gym_owner", "branch_manager"];
const isManager = (u) => MANAGERS.includes(u.role);

const gate = async (req) => {
  const s = await hr.getSetting(req.user.tenantId);
  if (!hr.moduleOn(s, req.user.role))
    throw fail(
      403,
      "Attendance & leave is turned off for your role in this gym",
    );
  if (req.user.role === "member" || req.user.role === "super_admin")
    throw fail(403, "Staff only");
  return s;
};
const fmtDay = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
const allowanceOf = (s) => ({
  ...DEFAULT_ALLOWANCE,
  ...(s?.leaveAllowance || {}),
});
const yearStartOf = (iso) => istDay(`${String(iso).slice(0, 4)}-01-01`);

async function taken(tenantId, userId, type, yearStart, excludeId) {
  const rows = await StaffLeave.find({
    tenantId,
    userId,
    leaveType: type,
    status: { $in: ["pending", "approved"] },
    startDate: { $gte: yearStart },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();
  return rows.reduce((n, l) => n + l.days, 0);
}
async function balanceOf(tenantId, userId, s, yearStart) {
  const al = allowanceOf(s);
  const out = {};
  for (const [t, total] of Object.entries(al)) {
    const used = await taken(tenantId, userId, t, yearStart);
    out[t] = { total, used, left: Math.max(0, total - used) };
  }
  return out;
}

// Reads + validates the form shared by create and edit.
async function parseLeave(body, s, { tenantId, userId, excludeId }) {
  const { leaveType, startDate, endDate, reason, isHalfDay, halfDayType } =
    body;
  if (!TYPES.includes(leaveType)) throw fail(400, "Pick a leave type");
  if (!reason || !String(reason).trim()) throw fail(400, "Reason is required");
  const start = istDay(String(startDate).slice(0, 10));
  const end = istDay(String(endDate || startDate).slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw fail(400, "Invalid dates");
  if (end < start) throw fail(400, "End date is before start date");
  const half = isHalfDay === true || isHalfDay === "true";
  if (half && +start !== +end)
    throw fail(400, "A half day leave is for a single date");
  const days = half ? 0.5 : Math.round((end - start) / DAY) + 1;
  if (days > MAX_LEAVE_DAYS)
    throw fail(400, `Leave can be at most ${MAX_LEAVE_DAYS} days`);
  if (
    await StaffLeave.exists({
      tenantId,
      userId,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      status: { $in: ["pending", "approved"] },
      startDate: { $lte: end },
      endDate: { $gte: start },
    })
  )
    throw fail(400, "You already have a leave request on those dates");
  if (leaveType !== "unpaid") {
    const total = allowanceOf(s)[leaveType] ?? 0;
    const used = await taken(
      tenantId,
      userId,
      leaveType,
      yearStartOf(startDate),
      excludeId,
    );
    if (used + days > total)
      throw fail(
        400,
        `Only ${Math.max(0, total - used)} ${leaveType} leave day(s) left this year; choose unpaid for the rest`,
      );
  }
  return {
    leaveType,
    startDate: start,
    endDate: end,
    days,
    reason: String(reason).trim().slice(0, 500),
    isHalfDay: half,
    halfDayType:
      half && ["first_half", "second_half"].includes(halfDayType)
        ? halfDayType
        : undefined,
  };
}

const listLeaves = asyncHandler(async (req, res) => {
  await gate(req);
  const all = [...MANAGERS, "accountant"].includes(req.user.role);
  const q = {
    tenantId: req.user.tenantId,
    ...(all ? {} : { userId: req.user._id }),
  };
  if (req.query.status) q.status = String(req.query.status);
  const data = await StaffLeave.find(q)
    .populate("userId", "name role")
    .sort("-createdAt")
    .limit(300)
    .lean();
  res.json({ success: true, count: data.length, data });
});

// Allowance (everyone) + the caller's own balance this year.
const getAllowance = asyncHandler(async (req, res) => {
  const s = await gate(req);
  const balance = await balanceOf(
    req.user.tenantId,
    req.user._id,
    s,
    yearStartOf(new Date(Date.now() + 5.5 * 3600000).toISOString()),
  );
  res.json({
    success: true,
    data: { allowance: allowanceOf(s), types: TYPES, balance },
  });
});
const setAllowance = asyncHandler(async (req, res) => {
  const next = {};
  for (const t of Object.keys(DEFAULT_ALLOWANCE)) {
    const n = Number(req.body?.[t]);
    next[t] = Number.isFinite(n)
      ? Math.min(365, Math.max(0, Math.round(n * 2) / 2))
      : DEFAULT_ALLOWANCE[t];
  }
  await Setting.updateOne(
    { tenantId: req.user.tenantId },
    { $set: { leaveAllowance: next } },
    { upsert: true },
  );
  res.json({ success: true, data: { allowance: next } });
});

const createLeave = asyncHandler(async (req, res) => {
  const s = await gate(req);
  let target = req.user;
  if (req.body.userId && String(req.body.userId) !== String(req.user._id)) {
    if (!isManager(req.user))
      throw fail(403, "Only the owner or a manager can apply for someone else");
    target = await User.findOne({
      _id: req.body.userId,
      tenantId: req.user.tenantId,
      role: { $nin: ["member", "super_admin", "gym_owner"] },
    });
    if (!target) throw fail(404, "Staff member not found");
  }
  const f = await parseLeave(req.body, s, {
    tenantId: req.user.tenantId,
    userId: target._id,
  });
  const leave = await StaffLeave.create({
    tenantId: req.user.tenantId,
    userId: target._id,
    ...f,
  });
  const span =
    f.days <= 1
      ? fmtDay(f.startDate)
      : `${fmtDay(f.startDate)} - ${fmtDay(f.endDate)}`;
  if (target === req.user)
    hr.owners(req.user.tenantId).then((os) =>
      os.forEach((o) =>
        hr.sendStaffWhatsApp(
          req.user.tenantId,
          "staffLeaveRequest",
          { ...o.toObject(), name: req.user.name },
          `${f.leaveType} ${span}`,
          undefined,
          req.user.role,
        ),
      ),
    );
  res.status(201).json({ success: true, data: leave });
});

// Change a leave that is still pending (the requester or an owner / manager).
const editLeave = asyncHandler(async (req, res) => {
  const s = await gate(req);
  const leave = await StaffLeave.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!leave) throw fail(404, "Leave request not found");
  if (String(leave.userId) !== String(req.user._id) && !isManager(req.user))
    throw fail(403, "Not allowed");
  if (leave.status !== "pending")
    throw fail(400, "Only a pending request can be edited");
  Object.assign(
    leave,
    await parseLeave(req.body, s, {
      tenantId: leave.tenantId,
      userId: leave.userId,
      excludeId: leave._id,
    }),
  );
  await leave.save();
  res.json({ success: true, data: leave });
});

// Owner / manager approves (paid or unpaid) or rejects. Approval marks each day on the attendance sheet; a day already worked is left alone.
const decideLeave = asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body;
  if (!["approved", "rejected"].includes(status))
    throw fail(400, "status must be approved or rejected");
  const leave = await StaffLeave.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!leave) throw fail(404, "Leave request not found");
  if (leave.status !== "pending") throw fail(400, `Already ${leave.status}`);
  if (String(leave.userId) === String(req.user._id))
    throw fail(403, "You can't decide your own leave");
  if (
    status === "rejected" &&
    !String(rejectionReason || "").trim() &&
    req.body.requireReason
  )
    throw fail(400, "Give a reason");
  leave.status = status;
  leave.decidedBy = req.user._id;
  leave.decidedAt = new Date();
  leave.paid =
    leave.leaveType !== "unpaid" &&
    req.body.paid !== false &&
    req.body.paid !== "false";
  if (status === "rejected")
    leave.rejectionReason = String(rejectionReason || "").slice(0, 300);
  await leave.save();
  const user = await User.findOne({
    _id: leave.userId,
    tenantId: req.user.tenantId,
  }).select("name phone branchId role");
  if (status === "approved") {
    const mark = leave.isHalfDay
      ? "half_day"
      : leave.paid
        ? "paid_leave"
        : "unpaid_leave";
    for (let i = 0; i < Math.ceil(leave.days); i++) {
      const date = new Date(leave.startDate.getTime() + i * DAY);
      const key = { tenantId: leave.tenantId, userId: leave.userId, date };
      const row = await StaffAttendance.findOne(key).lean();
      if (
        row &&
        (row.status === "present" ||
          row.status === "half_day" ||
          row.status === "late")
      )
        continue;
      await StaffAttendance.findOneAndUpdate(
        key,
        {
          $set: {
            status: mark,
            leaveId: leave._id,
            note: `Leave: ${leave.leaveType}${leave.isHalfDay ? " (half day)" : ""}`,
            markedBy: req.user._id,
            branchId: user?.branchId || null,
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
  }
  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "Staff",
    description: `${status} ${leave.leaveType} leave (${leave.days}d) for ${user?.name}`,
    targetId: leave._id,
    ip: req.ip,
  });
  if (user)
    hr.sendStaffWhatsApp(
      req.user.tenantId,
      "staffLeaveDecision",
      user,
      `${status} (${fmtDay(leave.startDate)}${leave.days > 1 ? ` - ${fmtDay(leave.endDate)}` : ""})`,
    );
  res.json({ success: true, data: leave });
});

// Withdraw a pending request (the requester), or cancel pending / approved leave with a reason (owner / manager).
// Cancelling approved leave removes the days it had marked.
const cancelLeave = asyncHandler(async (req, res) => {
  await gate(req);
  const leave = await StaffLeave.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!leave) throw fail(404, "Leave request not found");
  const mine = String(leave.userId) === String(req.user._id);
  if (!mine && !isManager(req.user)) throw fail(403, "Not allowed");
  if (leave.status === "approved") {
    if (!isManager(req.user))
      throw fail(403, "Ask the owner to cancel approved leave");
    if (!String(req.body.reason || "").trim())
      throw fail(400, "Give a reason for cancelling approved leave");
  } else if (leave.status !== "pending")
    throw fail(400, `Already ${leave.status}`);
  if (leave.status === "approved")
    await StaffAttendance.deleteMany({
      tenantId: leave.tenantId,
      leaveId: leave._id,
    });
  leave.status = "cancelled";
  leave.cancellationReason = String(req.body.reason || "").slice(0, 300);
  await leave.save();
  res.json({ success: true, data: leave });
});

module.exports = {
  balanceOf,
  allowanceOf,
  yearStartOf,
  listLeaves,
  getAllowance,
  setAllowance,
  createLeave,
  editLeave,
  decideLeave,
  cancelLeave,
};
