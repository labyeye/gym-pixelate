const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const Member = require("../models/Member");
const Enquiry = require("../models/Enquiry");
const User = require("../models/User");
const { buildOpportunities, summarize } = require("../utils/retention");
const { fail, addDays } = require("../utils/gym");
const logActivity = require("../utils/activityLogger");

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const BRANCH_BOUND = ["branch_manager", "receptionist", "trainer"];

// Tenant (+ branch) match. Branch-bound staff can only see their own branch.
function scope(req) {
  const m = { tenantId: oid(req.user.tenantId) };
  const b =
    BRANCH_BOUND.includes(req.user.role) && req.user.branchId
      ? req.user.branchId
      : req.query.branchId;
  if (b) m.branchId = oid(b);
  return m;
}
const clamp = (v, lo, hi) =>
  v === undefined || v === ""
    ? undefined
    : Math.min(hi, Math.max(lo, Number(v) || lo));

const opportunities = asyncHandler(async (req, res) => {
  const opts = {};
  const e = clamp(req.query.expiringDays, 1, 60),
    l = clamp(req.query.lapsedDays, 1, 120),
    a = clamp(req.query.atRiskDays, 3, 90);
  if (e) opts.expiringDays = e;
  if (l) opts.lapsedDays = l;
  if (a) opts.atRiskDays = a;
  const all = await buildOpportunities(scope(req), opts);
  const items =
    req.query.includeSnoozed === "true" ? all : all.filter((i) => !i.snoozed);
  const type = req.query.type;
  res.json({
    success: true,
    summary: summarize(all),
    data: (type ? items.filter((i) => i.type === type) : items).slice(0, 300),
  });
});

const addFollowUp = asyncHandler(async (req, res) => {
  const { memberId, enquiryId, kind, outcome, note, nextFollowUpAt } = req.body;
  if (!!memberId === !!enquiryId)
    throw fail(400, "Provide exactly one of memberId or enquiryId");
  if (
    typeof outcome !== "string" ||
    !FollowUp.schema.path("outcome").enumValues.includes(outcome)
  )
    throw fail(400, "Invalid outcome");
  if (
    kind !== undefined &&
    !FollowUp.schema.path("kind").enumValues.includes(kind)
  )
    throw fail(400, "Invalid kind");
  const next = nextFollowUpAt ? new Date(nextFollowUpAt) : null;
  if (next && Number.isNaN(next.getTime()))
    throw fail(400, "Invalid follow-up date");

  // Ownership: the record must belong to the caller's gym (and branch, for branch-bound staff).
  const m = scope(req);
  const target = memberId
    ? await Member.findOne({ ...m, _id: String(memberId) }).select("branchId")
    : await Enquiry.findOne({ ...m, _id: String(enquiryId) }).select(
        "branchId",
      );
  if (!target)
    throw fail(404, memberId ? "Member not found" : "Enquiry not found");

  const fu = await FollowUp.create({
    tenantId: req.user.tenantId,
    branchId: target.branchId,
    memberId: memberId || null,
    enquiryId: enquiryId || null,
    kind: kind || "other",
    outcome,
    note: typeof note === "string" ? note.slice(0, 500) : undefined,
    // an attempt without a date still rests the item for 2 days so it isn't chased twice in a day
    nextFollowUpAt:
      next ||
      (["contacted", "interested", "no_answer", "unavailable"].includes(outcome)
        ? addDays(new Date(), 2)
        : null),
    by: req.user._id,
    byName: req.user.name,
  });
  logActivity({
    user: req.user,
    action: "CREATE",
    module: "FollowUp",
    description: `Follow-up (${fu.kind}/${outcome})`,
    targetId: fu._id,
    ip: req.ip,
  });
  res.status(201).json({ success: true, data: fu });
});

const listFollowUps = asyncHandler(async (req, res) => {
  const q = { ...scope(req) };
  if (req.query.memberId) q.memberId = oid(req.query.memberId);
  if (req.query.enquiryId) q.enquiryId = oid(req.query.enquiryId);
  const data = await FollowUp.find(q)
    .sort("-createdAt")
    .limit(Math.min(200, Number(req.query.limit) || 50))
    .lean();
  res.json({ success: true, data });
});

// Lead funnel: conversion by source and by assigned staff, plus the lost-reason mix.
const conversion = asyncHandler(async (req, res) => {
  const m = scope(req);
  const from = req.query.from
    ? new Date(req.query.from)
    : addDays(new Date(), -90);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
    throw fail(400, "Invalid date range");
  const base = [{ $match: { ...m, createdAt: { $gte: from, $lte: to } } }];
  const grp = (key) => [
    ...base,
    {
      $group: {
        _id: key,
        total: { $sum: 1 },
        converted: {
          $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
        },
        lost: { $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ];
  const [bySource, byStaff, lostReasons, overdue] = await Promise.all([
    Enquiry.aggregate(grp("$source")),
    Enquiry.aggregate(grp("$assignedTo")),
    Enquiry.aggregate([
      ...base,
      { $match: { status: "lost" } },
      { $group: { _id: "$lostReason", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    Enquiry.countDocuments({
      ...m,
      status: { $nin: ["converted", "lost"] },
      followUpAt: { $lt: new Date() },
    }),
  ]);
  const names = new Map(
    (
      await User.find({
        _id: { $in: byStaff.map((s) => s._id).filter(Boolean) },
      })
        .select("name")
        .lean()
    ).map((u) => [String(u._id), u.name]),
  );
  const rate = (r) => ({
    ...r,
    rate: r.total ? Math.round((r.converted / r.total) * 1000) / 10 : 0,
  });
  res.json({
    success: true,
    data: {
      from,
      to,
      followUpsOverdue: overdue,
      bySource: bySource.map((r) =>
        rate({
          source: r._id || "unknown",
          total: r.total,
          converted: r.converted,
          lost: r.lost,
        }),
      ),
      byStaff: byStaff.map((r) =>
        rate({
          staff: r._id ? names.get(String(r._id)) || "Unknown" : "Unassigned",
          total: r.total,
          converted: r.converted,
          lost: r.lost,
        }),
      ),
      lostReasons: lostReasons.map((r) => ({
        reason: r._id || "not recorded",
        count: r.n,
      })),
    },
  });
});

module.exports = { opportunities, addFollowUp, listFollowUps, conversion };
