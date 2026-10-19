const asyncHandler = require("express-async-handler");
const Attendance = require("../models/Attendance");
const Member = require("../models/Member");
const logActivity = require("../utils/activityLogger");
const { fail, evaluateAccess, istDayStart, istDay } = require("../utils/gym");

const isManager = (u) =>
  ["super_admin", "gym_owner", "branch_manager"].includes(u.role);

const getAttendance = asyncHandler(async (req, res) => {
  const {
    branchId,
    memberId,
    startDate,
    endDate,
    inside,
    page = 1,
    limit = 50,
  } = req.query;
  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (branchId) query.branchId = branchId;
  if (memberId) query.memberId = memberId;
  if (inside === "true") query.checkoutAt = null;
  if (startDate || endDate) {
    query.checkinAt = {};
    if (startDate) query.checkinAt.$gte = istDay(startDate);
    if (endDate) query.checkinAt.$lte = istDay(endDate, true);
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [records, total] = await Promise.all([
    Attendance.find(query)
      .populate("memberId", "name email phone memberCode photo")
      .sort("-checkinAt")
      .skip(skip)
      .limit(parseInt(limit)),
    Attendance.countDocuments(query),
  ]);
  res.json({
    success: true,
    count: records.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: records,
  });
});

// Dry-run for the desk / kiosk: "can this person enter?" with the reason, without recording a visit.
const checkAccess = asyncHandler(async (req, res) => {
  const member = await findMember(req.body);
  res.json({
    success: true,
    data: { member: brief(member), ...(await evaluateAccess(member)) },
  });
});

const brief = (m) => ({
  _id: m._id,
  name: m.name,
  memberCode: m.memberCode,
  photo: m.photo,
  phone: m.phone,
});

async function findMember({ memberId, memberCode, phone }) {
  const q = memberId
    ? { _id: memberId }
    : memberCode
      ? { memberCode: String(memberCode).trim().toUpperCase() }
      : phone
        ? { phone: String(phone).trim() }
        : null;
  if (!q) throw fail(400, "memberId, memberCode or phone is required");
  const member = await Member.findOne(q);
  if (!member) throw fail(404, "Member not found");
  return member;
}

const checkin = asyncHandler(async (req, res) => {
  const { branchId, method, confidence, override, overrideReason } = req.body;
  if (!branchId) throw fail(400, "branchId is required");
  const member = await findMember(req.body);

  if (await Attendance.exists({ memberId: member._id, checkoutAt: null }))
    throw fail(409, `${member.name} is already inside — check out first`);
  const access = await evaluateAccess(member);
  let overridden = false;
  if (!access.allowed) {
    if (override && access.overridable && isManager(req.user) && overrideReason)
      overridden = true;
    else
      throw fail(403, access.reason, {
        overridable: access.overridable && isManager(req.user),
        data: { member: brief(member) },
      });
  }

  let record;
  try {
    record = await Attendance.create({
      tenantId: req.user.tenantId || member.tenantId,
      branchId,
      memberId: member._id,
      membershipId: access.membership?._id || null,
      method: method || "manual",
      confidence: confidence ?? null,
      recordedBy: req.user._id,
      overrideReason: overridden ? overrideReason : undefined,
    });
  } catch (e) {
    if (e.code === 11000)
      throw fail(409, `${member.name} is already inside — check out first`);
    throw e;
  }
  logActivity({
    user: req.user,
    action: "CHECKIN",
    module: "Attendance",
    description: `Checked in ${member.name}${overridden ? ` (override: ${overrideReason})` : ""}`,
    targetId: record._id,
    ip: req.ip,
  });
  res
    .status(201)
    .json({
      success: true,
      data: record,
      member: brief(member),
      warnings: access.warnings,
    });
});

const checkout = asyncHandler(async (req, res) => {
  const { attendanceId, memberId, memberCode } = req.body;
  let filter;
  if (attendanceId) filter = { _id: attendanceId, checkoutAt: null };
  else {
    const member = await findMember({ memberId, memberCode });
    filter = { memberId: member._id, checkoutAt: null };
  }
  const open = await Attendance.findOne(filter).sort("-checkinAt");
  if (!open) throw fail(404, "Open attendance record not found");
  const now = new Date();
  // conditional so a double tap can't re-stamp the time
  const record = await Attendance.findOneAndUpdate(
    { _id: open._id, checkoutAt: null },
    {
      $set: {
        checkoutAt: now,
        durationMin: Math.max(1, Math.round((now - open.checkinAt) / 60000)),
      },
    },
    { new: true },
  );
  if (!record) throw fail(409, "Already checked out");
  logActivity({
    user: req.user,
    action: "CHECKOUT",
    module: "Attendance",
    description: `Checked out member ${record.memberId}`,
    targetId: record._id,
    ip: req.ip,
  });
  res.json({ success: true, data: record });
});

// Who is in the gym right now + today's footfall.
const liveStatus = asyncHandler(async (req, res) => {
  const t = {
    ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
    ...(req.query.branchId ? { branchId: req.query.branchId } : {}),
  };
  const [inside, today] = await Promise.all([
    Attendance.find({ ...t, checkoutAt: null })
      .populate("memberId", "name memberCode photo")
      .sort("-checkinAt")
      .limit(200),
    Attendance.countDocuments({ ...t, checkinAt: { $gte: istDayStart() } }),
  ]);
  res.json({
    success: true,
    data: { insideCount: inside.length, todayCheckins: today, inside },
  });
});

module.exports = { getAttendance, checkAccess, checkin, checkout, liveStatus };
