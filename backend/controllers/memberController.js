const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const Invoice = require("../models/Invoice");
const BodyMeasurement = require("../models/BodyMeasurement");
const PTPackage = require("../models/PTPackage");
const WorkoutPlan = require("../models/WorkoutPlan");
const DietPlan = require("../models/DietPlan");
const TrainerAssignment = require("../models/TrainerAssignment");
const User = require("../models/User");
const Locker = require("../models/Locker");
const logActivity = require("../utils/activityLogger");
const {
  fail,
  assertCapacity,
  nextCode,
  r2,
} = require("../utils/gym");

// fields a client may never set directly
const PROTECTED = [
  "_id",
  "tenantId",
  "userId",
  "memberCode",
  "createdAt",
  "updatedAt",
];
const clean = (body) =>
  Object.fromEntries(
    Object.entries(body).filter(([k]) => !PROTECTED.includes(k)),
  );

const getMembers = asyncHandler(async (req, res) => {
  const {
    branchId,
    status,
    search,
    page = 1,
    limit = 50,
    gender,
    goal,
    source,
    plan,
    planStatus,
  } = req.query;

  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (branchId) query.branchId = branchId;
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { memberCode: { $regex: search, $options: "i" } },
    ];
  }
  if (gender) query.gender = gender;
  if (goal) query["fitness.goal"] = goal;
  if (source) query.source = source;
  if (plan || planStatus) {
    const mq = {};
    if (req.user.tenantId) mq.tenantId = req.user.tenantId;
    if (plan) mq.planName = plan;
    const soon = new Date(Date.now() + 7 * 86400000);
    if (planStatus === "active") mq.status = "active";
    else if (planStatus === "expiring") {
      mq.status = "active";
      mq.endDate = { $lte: soon };
    } else if (planStatus === "expired") mq.status = "expired";
    else if (planStatus === "dues") {
      mq.status = { $ne: "cancelled" };
      mq.$expr = { $gt: ["$totalAmount", "$paidAmount"] };
    } else mq.status = { $in: ["active", "frozen", "upcoming"] };
    if (planStatus === "none") delete mq.status;
    const ids = await Membership.distinct("memberId", mq);
    if (planStatus === "none") query._id = { $nin: ids };
    else if (planStatus === "expired") {
      const live = await Membership.distinct("memberId", {
        status: { $in: ["active", "frozen", "upcoming"] },
        ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
      });
      query._id = { $in: ids, $nin: live };
    } else query._id = { $in: ids };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [rows, total] = await Promise.all([
    Member.find(query)
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Member.countDocuments(query),
  ]);
  const ms = await Membership.find({
    memberId: { $in: rows.map((m) => m._id) },
    status: { $in: ["active", "frozen", "upcoming", "expired"] },
  })
    .select("memberId planName status startDate endDate totalAmount paidAmount")
    .sort("-endDate")
    .lean();
  const latest = new Map();
  for (const m of ms)
    if (!latest.has(String(m.memberId))) latest.set(String(m.memberId), m);
  const members = rows.map((m) => {
    const c = latest.get(String(m._id));
    return {
      ...m,
      currentMembership: c
        ? {
            planName: c.planName,
            status: c.status,
            startDate: c.startDate,
            endDate: c.endDate,
            due: r2(c.totalAmount - c.paidAmount),
          }
        : null,
    };
  });

  res.json({
    success: true,
    count: members.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: members,
  });
});

const searchMembers = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.json({ success: true, count: 0, data: [] });
  }

  const query = {
    $or: [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ],
  };
  if (req.user.tenantId) query.tenantId = req.user.tenantId;

  const members = await Member.find(query).limit(20);

  res.json({ success: true, count: members.length, data: members });
});

const getMember = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);

  if (!member) {
    res.status(404);
    throw new Error("Member not found");
  }

  res.json({ success: true, data: member });
});

const createMember = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!tenantId) throw fail(400, "A gym account is required to add members");
  const body = clean(req.body);
  if (!body.branchId) throw fail(400, "branchId is required");
  await assertCapacity(tenantId, "members");
  const dup = (
    await Member.find({ tenantId, phone: String(body.phone || "").trim() })
  ).find(
    (m) =>
      m.name.toLowerCase() ===
      String(body.name || "")
        .trim()
        .toLowerCase(),
  );
  if (dup)
    throw fail(
      409,
      `${dup.name} (${dup.memberCode || dup.phone}) is already a member`,
      { data: { memberId: dup._id } },
    );

  // Optional: pick a trainer while adding the member. Checked up front so a full trainer rejects the form
  // before any member is created.
  const trainerId = req.body.trainerId || undefined;
  let trainer = null;
  if (trainerId) {
    trainer = await User.findOne({ _id: trainerId, role: "trainer", status: "active" });
    if (!trainer) throw fail(404, "Active trainer not found");
    const max = trainer.trainerProfile?.maxClients;
    if (max) {
      const load = await TrainerAssignment.countDocuments({ trainerId, isActive: true });
      if (load >= max) throw fail(409, `${trainer.name} already has ${load} clients (max ${max})`);
    }
  }

  const member = new Member({ ...body, tenantId });
  await member.validate(); // before the code is issued, so a rejected form never burns a number
  member.memberCode = await nextCode(tenantId, "member", "GYM");
  if (
    member.health?.declarationSignedAt === undefined &&
    req.body.acceptDeclaration
  )
    member.health.declarationSignedAt = new Date();
  await member.save();
  if (trainer) {
    await TrainerAssignment.create({ tenantId, branchId: member.branchId, trainerId: trainer._id, memberId: member._id });
  }

  logActivity({
    user: req.user,
    action: "CREATE",
    module: "Member",
    description: `Created member: ${member.name} (${member.memberCode})${trainer ? ` with trainer ${trainer.name}` : ""}`,
    targetId: member._id,
    ip: req.ip,
  });
  res.status(201).json({ success: true, data: member });
});

const updateMember = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw fail(404, "Member not found");
  member.set(clean(req.body));
  await member.save();
  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "Member",
    description: `Updated member: ${member.name}`,
    targetId: member._id,
    ip: req.ip,
  });
  res.json({ success: true, data: member });
});

// A member with history is deactivated, not erased: invoices and memberships must keep pointing at someone.
const deleteMember = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw fail(404, "Member not found");
  const hasHistory =
    (await Membership.exists({ memberId: member._id })) ||
    (await Invoice.exists({ memberId: member._id }));
  if (hasHistory) {
    member.status = "inactive";
    await member.save();
    await Locker.updateMany(
      { memberId: member._id, status: "assigned" },
      {
        $set: { status: "available", memberId: null },
        $unset: { assignedOn: 1, validTill: 1 },
      },
    );
    logActivity({
      user: req.user,
      action: "UPDATE",
      module: "Member",
      description: `Deactivated member (has history): ${member.name}`,
      targetId: member._id,
      ip: req.ip,
    });
    return res.json({
      success: true,
      message:
        "Member has history, so they were marked inactive instead of deleted",
      deactivated: true,
    });
  }
  await Member.deleteOne({ _id: member._id });
  logActivity({
    user: req.user,
    action: "DELETE",
    module: "Member",
    description: `Deleted member: ${member.name}`,
    targetId: member._id,
    ip: req.ip,
  });
  res.json({ success: true, message: "Member deleted successfully" });
});

// Everything about one member on one screen: the "member 360" the front desk and trainers work from.
const getMemberOverview = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw fail(404, "Member not found");
  const id = member._id;
  const [
    memberships,
    invoices,
    measurements,
    pt,
    workout,
    diet,
    trainers,
    locker,
  ] = await Promise.all([
    Membership.find({ memberId: id }).sort("-startDate").limit(20),
    Invoice.find({ memberId: id }).sort("-issuedAt").limit(20),
    BodyMeasurement.find({ memberId: id }).sort("-measuredAt").limit(12),
    PTPackage.find({ memberId: id })
      .sort("-createdAt")
      .limit(5)
      .populate("trainerId", "name"),
    WorkoutPlan.findOne({ memberId: id, status: "active" }).sort("-createdAt"),
    DietPlan.findOne({ memberId: id, status: "active" }).sort("-createdAt"),
    TrainerAssignment.find({ memberId: id, isActive: true }).populate(
      "trainerId",
      "name phone",
    ),
    Locker.findOne({ memberId: id, status: "assigned" }),
  ]);
  const due = r2(
    invoices
      .filter((i) => ["pending", "partial"].includes(i.status))
      .reduce((t, i) => t + i.totalAmount - i.paidAmount, 0),
  );
  res.json({
    success: true,
    data: {
      member,
      due,
      memberships,
      invoices,
      measurements,
      pt,
      workout,
      diet,
      trainers,
      locker,
    },
  });
});

module.exports = {
  getMembers,
  searchMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMemberOverview,
};
