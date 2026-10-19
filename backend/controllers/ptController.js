const asyncHandler = require("express-async-handler");
const PTPackage = require("../models/PTPackage");
const Member = require("../models/Member");
const User = require("../models/User");
const logActivity = require("../utils/activityLogger");
const { fail, r2, createInvoice, addDays } = require("../utils/gym");

const log = (req, action, doc, text) =>
  logActivity({
    user: req.user,
    action,
    module: "PersonalTraining",
    description: text,
    targetId: doc._id,
    ip: req.ip,
  });
const POP = [
  ["memberId", "name phone memberCode photo"],
  ["trainerId", "name phone"],
];

const getPackages = asyncHandler(async (req, res) => {
  const { memberId, trainerId, status, branchId } = req.query;
  const q = { ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}) };
  if (memberId) q.memberId = memberId;
  if (branchId) q.branchId = branchId;
  if (status) q.status = status;
  // a trainer only ever sees their own clients
  if (req.user.role === "trainer") q.trainerId = req.user._id;
  else if (trainerId) q.trainerId = trainerId;
  const data = await POP.reduce(
    (acc, p) => acc.populate(...p),
    PTPackage.find(q),
  )
    .sort("-createdAt")
    .limit(200);
  res.json({ success: true, count: data.length, data });
});

const getPackage = asyncHandler(async (req, res) => {
  const pkg = await POP.reduce(
    (acc, p) => acc.populate(...p),
    PTPackage.findById(req.params.id),
  );
  if (!pkg) throw fail(404, "PT package not found");
  res.json({ success: true, data: pkg });
});

// Sell a PT package: validates member + trainer, bills it, optionally takes the first payment.
const createPackage = asyncHandler(async (req, res) => {
  const b = req.body;
  const total = Number(b.totalSessions);
  if (!(total >= 1)) throw fail(400, "totalSessions must be at least 1");
  const [member, trainer] = await Promise.all([
    Member.findById(b.memberId),
    User.findOne({
      _id: b.trainerId,
      tenantId: req.user.tenantId,
      role: "trainer",
    }),
  ]);
  if (!member) throw fail(404, "Member not found");
  if (!trainer) throw fail(404, "Trainer not found");
  const perSession = Number(b.pricePerSession) || 0;
  const amount = r2(perSession * total);

  let invoice = null;
  if (amount > 0) {
    invoice = await createInvoice({
      tenantId: req.user.tenantId,
      branchId: b.branchId || member.branchId,
      memberId: member._id,
      items: [
        {
          kind: "pt_package",
          description: `${b.name || "Personal Training"} — ${total} sessions with ${trainer.name}`,
          quantity: total,
          unitPrice: perSession,
          gstPercent: b.gstPercent ?? 18,
        },
      ],
      discount: b.discount,
      payNow: Number(b.payNow) || 0,
      method: b.method,
      reference: b.reference,
      userId: req.user._id,
      idempotencyKey: b.idempotencyKey,
    });
  }
  const pkg = await PTPackage.create({
    tenantId: req.user.tenantId,
    branchId: b.branchId || member.branchId,
    memberId: member._id,
    trainerId: trainer._id,
    name: b.name || "Personal Training",
    totalSessions: total,
    pricePerSession: perSession,
    totalAmount: invoice ? invoice.totalAmount : 0,
    paidAmount: invoice ? invoice.paidAmount : 0,
    invoiceId: invoice?._id,
    commissionPercent: b.commissionPercent ?? 0,
    validTill: b.validTill
      ? new Date(b.validTill)
      : addDays(new Date(), Math.max(30, total * 7)),
  });
  log(
    req,
    "CREATE",
    pkg,
    `Sold ${total} PT sessions of ${trainer.name} to ${member.name}`,
  );
  res.status(201).json({ success: true, data: pkg, invoice });
});

const scheduleSession = asyncHandler(async (req, res) => {
  const { scheduledAt, durationMin = 60, notes } = req.body;
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) throw fail(400, "Pick a valid date and time");
  if (at < new Date()) throw fail(400, "Pick a time in the future");
  const pkg = await PTPackage.findById(req.params.id);
  if (!pkg) throw fail(404, "PT package not found");
  if (pkg.status !== "active") throw fail(409, `This package is ${pkg.status}`);
  const booked = pkg.sessions.filter(
    (s) => s.status !== "cancelled" && s.status !== "missed",
  ).length;
  if (booked >= pkg.totalSessions)
    throw fail(409, "All sessions in this package are already booked");

  // the trainer can't be in two places: reject overlapping sessions across ALL of their packages
  const end = new Date(at.getTime() + durationMin * 60000);
  const clash = await PTPackage.findOne({
    trainerId: pkg.trainerId,
    status: "active",
    sessions: {
      $elemMatch: {
        status: "scheduled",
        scheduledAt: { $lt: end, $gt: new Date(at.getTime() - 180 * 60000) },
      },
    },
  });
  if (
    clash &&
    clash.sessions.some(
      (s) =>
        s.status === "scheduled" &&
        s.scheduledAt < end &&
        new Date(s.scheduledAt.getTime() + s.durationMin * 60000) > at,
    )
  ) {
    throw fail(409, "The trainer already has a session at that time");
  }
  pkg.sessions.push({ scheduledAt: at, durationMin, notes });
  await pkg.save();
  res.status(201).json({ success: true, data: pkg });
});

// complete | missed | cancelled — conditional so one session can only be consumed once.
const updateSession = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!["completed", "missed", "cancelled"].includes(status))
    throw fail(400, "status must be completed, missed or cancelled");
  const pkg = await PTPackage.findOneAndUpdate(
    {
      _id: req.params.id,
      sessions: {
        $elemMatch: { _id: req.params.sessionId, status: "scheduled" },
      },
    },
    {
      $set: {
        "sessions.$.status": status,
        "sessions.$.notes": notes,
        ...(status === "completed"
          ? { "sessions.$.completedAt": new Date() }
          : {}),
      },
    },
    { new: true },
  );
  if (!pkg) throw fail(409, "Session not found or already closed");
  if (
    pkg.remainingSessions === 0 &&
    pkg.sessions.every((s) => s.status !== "scheduled") &&
    pkg.status === "active"
  ) {
    pkg.status = "completed";
    await pkg.save();
  }
  res.json({ success: true, data: pkg });
});

// Trainer payout sheet: commission is earned per delivered session, not on the day of sale.
const commissionReport = asyncHandler(async (req, res) => {
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const q = { ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}) };
  if (req.user.role === "trainer") q.trainerId = req.user._id;
  const pkgs = await PTPackage.find(q).populate("trainerId", "name");
  const by = new Map();
  for (const p of pkgs) {
    const done = p.sessions.filter(
      (s) =>
        s.status === "completed" &&
        s.completedAt >= from &&
        s.completedAt <= to,
    ).length;
    if (!done) continue;
    const key = String(p.trainerId._id);
    const row = by.get(key) || {
      trainerId: key,
      trainer: p.trainerId.name,
      sessions: 0,
      revenue: 0,
      commission: 0,
    };
    const revenue = r2(done * p.pricePerSession);
    row.sessions += done;
    row.revenue = r2(row.revenue + revenue);
    row.commission = r2(row.commission + (revenue * p.commissionPercent) / 100);
    by.set(key, row);
  }
  res.json({
    success: true,
    from,
    to,
    data: [...by.values()].sort((a, b) => b.commission - a.commission),
  });
});

module.exports = {
  getPackages,
  getPackage,
  createPackage,
  scheduleSession,
  updateSession,
  commissionReport,
};
