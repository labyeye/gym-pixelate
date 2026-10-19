const asyncHandler = require("express-async-handler");
const GymClass = require("../models/GymClass");
const ClassBooking = require("../models/ClassBooking");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const logActivity = require("../utils/activityLogger");
const { fail, istHHmm, DAY } = require("../utils/gym");

const IST = 5.5 * 60 * 60 * 1000;
const log = (req, action, doc, text) =>
  logActivity({
    user: req.user,
    action,
    module: "Class",
    description: text,
    targetId: doc._id,
    ip: req.ip,
  });

/** Is `when` one of this class's real slots (weekday + start time, IST)? Stops bookings for sessions that don't exist. */
function isScheduled(cls, when) {
  const local = new Date(when.getTime() + IST);
  return cls.schedule.some(
    (s) =>
      s.day === local.getUTCDay() &&
      s.start === local.toISOString().slice(11, 16),
  );
}

const liveCount = (classId, sessionDate) =>
  ClassBooking.countDocuments({
    classId,
    sessionDate,
    status: { $in: ["booked", "attended"] },
  });

// Upcoming sessions for the next N days with seats left, built from the weekly schedule.
async function buildSessions(req) {
  const days = Math.min(14, Number(req.query.days) || 7);
  const q = {
    isActive: true,
    ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
    ...(req.query.branchId ? { branchId: req.query.branchId } : {}),
  };
  const classes = await GymClass.find(q).populate("trainerId", "name");
  const now = new Date();
  const dayStartIst = Math.floor((now.getTime() + IST) / DAY) * DAY - IST;
  const out = [];
  for (let d = 0; d < days; d++) {
    const base = dayStartIst + d * DAY;
    const dow = new Date(base + IST).getUTCDay();
    for (const c of classes) {
      for (const s of c.schedule.filter((x) => x.day === dow)) {
        const [h, m] = s.start.split(":").map(Number);
        const at = new Date(base + (h * 60 + m) * 60000);
        if (at < now) continue;
        out.push({
          classId: c._id,
          name: c.name,
          category: c.category,
          trainer: c.trainerId?.name,
          room: c.room,
          sessionDate: at,
          durationMin: c.durationMin,
          capacity: c.capacity,
          dropInPrice: c.dropInPrice || 0,
        });
      }
    }
  }
  const counts = await ClassBooking.aggregate([
    {
      $match: {
        classId: { $in: classes.map((c) => c._id) },
        sessionDate: { $gte: now },
        status: { $in: ["booked", "waitlisted"] },
      },
    },
    {
      $group: {
        _id: { c: "$classId", d: "$sessionDate", s: "$status" },
        n: { $sum: 1 },
      },
    },
  ]);
  const key = (c, d, s) =>
    counts.find(
      (x) => String(x._id.c) === String(c) && +x._id.d === +d && x._id.s === s,
    )?.n || 0;
  out.forEach((s) => {
    s.booked = key(s.classId, s.sessionDate, "booked");
    s.waitlisted = key(s.classId, s.sessionDate, "waitlisted");
    s.seatsLeft = Math.max(0, s.capacity - s.booked);
  });
  out.sort((a, b) => a.sessionDate - b.sessionDate);
  return out;
}
const getSessions = asyncHandler(async (req, res) => {
  const out = await buildSessions(req);
  res.json({ success: true, count: out.length, data: out });
});

const getRoster = asyncHandler(async (req, res) => {
  const { classId, sessionDate } = req.query;
  if (!classId || !sessionDate)
    throw fail(400, "classId and sessionDate are required");
  const data = await ClassBooking.find({
    classId,
    sessionDate: new Date(sessionDate),
    status: { $ne: "cancelled" },
  })
    .populate("memberId", "name phone memberCode photo")
    .sort("status bookedAt");
  res.json({ success: true, count: data.length, data });
});

// Creates the booking; if two people grab the last seat the later one lands on the waitlist.
async function placeBooking(cls, memberId, when, extra = {}) {
  const classId = cls._id;
  let booking;
  try {
    booking = await ClassBooking.create({
      tenantId: cls.tenantId,
      branchId: cls.branchId,
      classId,
      memberId,
      sessionDate: when,
      status: "booked",
      ...extra,
    });
  } catch (e) {
    if (e.code === 11000) throw fail(409, "Already booked for this session");
    throw e;
  }
  // count AFTER inserting: if two people grabbed the last seat, the later one lands on the waitlist
  const taken = await ClassBooking.countDocuments({
    classId,
    sessionDate: when,
    status: { $in: ["booked", "attended"] },
    bookedAt: { $lte: booking.bookedAt },
    _id: { $lte: booking._id },
  });
  if (taken > cls.capacity) {
    const pos =
      (await ClassBooking.countDocuments({
        classId,
        sessionDate: when,
        status: "waitlisted",
      })) + 1;
    booking.status = "waitlisted";
    booking.waitlistPosition = pos;
    await booking.save();
  }
  return booking;
}

const bookClass = asyncHandler(async (req, res) => {
  const { classId, memberId, sessionDate } = req.body;
  if (!classId || !memberId || !sessionDate)
    throw fail(400, "classId, memberId and sessionDate are required");
  const when = new Date(sessionDate);
  const [cls, member] = await Promise.all([
    GymClass.findOne({ _id: classId, isActive: true }),
    Member.findById(memberId),
  ]);
  if (!cls) throw fail(404, "Class not found");
  if (!member || member.status !== "active")
    throw fail(404, "Active member not found");
  if (when < new Date()) throw fail(400, "That session has already started");
  if (!isScheduled(cls, when))
    throw fail(400, `${cls.name} does not run at that time`);

  const ms = await Membership.findOne({
    memberId,
    status: "active",
    startDate: { $lte: when },
    endDate: { $gte: when },
  }).populate("planId", "includes");
  if (!ms) throw fail(403, "Member has no active membership on that date");
  const inc = ms.planId?.includes;
  if (!inc?.classes && !cls.dropInPrice)
    throw fail(403, "This member's plan does not include group classes");
  const credits = inc?.classCreditsPerMonth || 0;
  if (inc?.classes && credits > 0) {
    const monthStart = new Date(when.getFullYear(), when.getMonth(), 1);
    const used = await ClassBooking.countDocuments({
      memberId,
      sessionDate: {
        $gte: monthStart,
        $lt: new Date(when.getFullYear(), when.getMonth() + 1, 1),
      },
      status: { $in: ["booked", "attended"] },
    });
    if (used + cls.creditsRequired > credits)
      throw fail(403, `Monthly class credits used up (${credits})`);
  }

  const booking = await placeBooking(cls, memberId, when);
  log(
    req,
    "CREATE",
    booking,
    `${booking.status === "booked" ? "Booked" : "Waitlisted"} ${member.name} into ${cls.name}`,
  );
  res
    .status(201)
    .json({
      success: true,
      data: booking,
      waitlisted: booking.status === "waitlisted",
    });
});

// Cancelling frees the seat; the longest-waiting member is promoted automatically.
const cancelBooking = asyncHandler(async (req, res) => {
  const b = await ClassBooking.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ["booked", "waitlisted"] } },
    { $set: { status: "cancelled", waitlistPosition: null } },
  );
  if (!b) throw fail(409, "Booking not found or already cancelled");
  let promoted = null;
  if (b.status === "booked") {
    promoted = await ClassBooking.findOneAndUpdate(
      { classId: b.classId, sessionDate: b.sessionDate, status: "waitlisted" },
      { $set: { status: "booked", waitlistPosition: null } },
      { sort: { bookedAt: 1 }, new: true },
    );
  }
  log(
    req,
    "UPDATE",
    b,
    `Cancelled class booking ${b._id}${promoted ? " (waitlist promoted)" : ""}`,
  );
  res.json({ success: true, promoted });
});

const markAttendance = asyncHandler(async (req, res) => {
  const { status } = req.body; // attended | no_show
  if (!["attended", "no_show"].includes(status))
    throw fail(400, "status must be attended or no_show");
  const b = await ClassBooking.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ["booked", "attended", "no_show"] } },
    { $set: { status } },
    { new: true },
  );
  if (!b) throw fail(404, "Booking not found");
  res.json({ success: true, data: b });
});

module.exports = {
  getSessions,
  getRoster,
  bookClass,
  buildSessions,
  placeBooking,
  isScheduled,
  cancelBooking,
  markAttendance,
};
