const asyncHandler = require("express-async-handler");
const MemberAttendance = require("../models/MemberAttendance");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const { fail, istDay, istDayStart } = require("../utils/gym");
const { memberPunch } = require("../utils/punch");
const hr = require("../utils/staffHr");

const gate = async (req) => {
  const s = await hr.getSetting(req.user.tenantId);
  if (!hr.moduleOn(s, "member"))
    throw fail(403, "Member attendance is turned off for this gym");
};

// Visits for one day (default today), newest first.
const list = asyncHandler(async (req, res) => {
  await gate(req);
  // ?month=YYYY-MM -> that whole month; ?date=YYYY-MM-DD -> one day; neither -> today
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ""));
  let date = req.query.date
    ? istDay(String(req.query.date).slice(0, 10))
    : istDayStart();
  if (Number.isNaN(date.getTime())) throw fail(400, "Invalid date");
  if (m) {
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    date = {
      $gte: istDay(`${m[1]}-${m[2]}-01`),
      $lte: istDay(`${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`, true),
    };
  }
  const data = (
    await MemberAttendance.find({ tenantId: req.user.tenantId, date })
      .populate("memberId", "name phone memberCode")
      .sort("-date -createdAt")
      .limit(3000)
      .lean()
  ).map((r) => ({
    ...r,
    day: new Date(r.date.getTime() + 5.5 * 3600000).toISOString().slice(0, 10),
  }));
  res.json({ success: true, count: data.length, data });
});

// Members with a running plan who have no visit on ?date (default today): NestHR's "not checked in" rows for members.
const notCheckedIn = asyncHandler(async (req, res) => {
  await gate(req);
  const date = req.query.date
    ? istDay(String(req.query.date).slice(0, 10))
    : istDayStart();
  if (Number.isNaN(date.getTime())) throw fail(400, "Invalid date");
  const dayEnd = new Date(date.getTime() + 86400000 - 1);
  const [ids, visited] = await Promise.all([
    Membership.distinct("memberId", {
      tenantId: req.user.tenantId,
      status: { $in: ["active", "expired"] },
      startDate: { $lte: dayEnd },
      endDate: { $gt: date },
    }),
    MemberAttendance.distinct("memberId", {
      tenantId: req.user.tenantId,
      date,
    }),
  ]);
  const seen = new Set(visited.map(String));
  const want = ids.filter((id) => !seen.has(String(id)));
  const data = await Member.find({
    _id: { $in: want.slice(0, 1000) },
    tenantId: req.user.tenantId,
    status: "active",
    erasedAt: { $exists: false },
  })
    .select("name phone memberCode")
    .sort("name")
    .limit(500)
    .lean();
  res.json({ success: true, count: data.length, data });
});

const punch = (action) =>
  asyncHandler(async (req, res) => {
    await gate(req);
    const member = await Member.findOne({
      _id: req.body.memberId,
      tenantId: req.user.tenantId,
    });
    if (!member) throw fail(404, "Member not found");
    const { row } = await memberPunch(member, {
      action,
      mode: "manual",
      markedBy: req.user._id,
    });
    res
      .status(action === "check_in" ? 201 : 200)
      .json({ success: true, data: row });
  });
const checkIn = punch("check_in");
const checkOut = punch("check_out");

module.exports = { notCheckedIn, list, checkIn, checkOut };
