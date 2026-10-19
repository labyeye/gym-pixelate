const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const Attendance = require("../models/Attendance");
const faceService = require("../services/faceService");
const logActivity = require("../utils/activityLogger");
const { evaluateAccess } = require("../utils/gym");

const brief = (m) => ({
  _id: m._id,
  name: m.name,
  memberCode: m.memberCode,
  photo: m.photo,
  phone: m.phone,
});

const registerFace = asyncHandler(async (req, res) => {
  const { memberId } = req.body;

  if (!memberId) {
    res.status(400);
    throw new Error("memberId is required");
  }
  if (!req.file) {
    res.status(400);
    throw new Error("A face image file is required");
  }

  const member = await Member.findById(memberId);
  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  const gymId = String(req.user.tenantId || "");
  const result = await faceService.registerFace(
    memberId,
    gymId,
    req.file.buffer,
    req.file.originalname,
  );

  member.faceRegistered = true;
  member.faceEmbedding = result.embedding;
  await member.save();

  logActivity({
    user: req.user,
    action: "FACE_REGISTERED",
    module: "Face",
    description: `Registered face for member ${member.name}`,
    targetId: member._id,
    ip: req.ip,
  });

  res.json({ success: true, data: { member, faceServiceResult: result } });
});

const verifyFace = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("A face image file is required");
  }

  const gymId = String(req.user.tenantId || "");
  const result = await faceService.verifyFace(
    gymId,
    req.file.buffer,
    req.file.originalname,
  );

  if (!result?.matched) {
    return res.json({ success: true, data: { matched: false } });
  }

  const memberId = result.member_id;
  const member = await Member.findById(memberId);

  if (!member) {
    return res.json({
      success: true,
      data: { matched: false, reason: "Member not found for match" },
    });
  }

  // same rules as the desk: expiry/grace, freeze, overdue dues, plan hours, visits per day, already inside
  const inside = await Attendance.exists({
    memberId: member._id,
    checkoutAt: null,
  });
  if (inside) {
    return res.json({
      success: true,
      data: {
        matched: true,
        membershipActive: true,
        alreadyInside: true,
        member: brief(member),
        reason: "Already checked in",
      },
    });
  }
  const access = await evaluateAccess(member);
  if (!access.allowed) {
    return res.json({
      success: true,
      data: {
        matched: true,
        membershipActive: false,
        member: brief(member),
        reason: access.reason,
        overridable: access.overridable,
      },
    });
  }

  let attendance;
  try {
    attendance = await Attendance.create({
      tenantId: member.tenantId,
      branchId: member.branchId,
      memberId: member._id,
      membershipId: access.membership?._id || null,
      method: "face",
      confidence: result.confidence ?? null,
      checkinAt: new Date(),
      recordedBy: req.user?._id || null,
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.json({
        success: true,
        data: {
          matched: true,
          membershipActive: true,
          alreadyInside: true,
          member: brief(member),
        },
      });
    }
    throw e;
  }

  logActivity({
    user: req.user,
    action: "CHECKIN",
    module: "Attendance",
    description: `Face check-in for member ${member.name}`,
    targetId: attendance._id,
    ip: req.ip,
  });

  res.json({
    success: true,
    data: {
      matched: true,
      membershipActive: true,
      member: brief(member),
      attendance,
      warnings: access.warnings,
    },
  });
});

module.exports = { registerFace, verifyFace };
