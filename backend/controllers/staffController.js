const asyncHandler = require("express-async-handler");
const StaffAttendance = require("../models/StaffAttendance");
const PTPackage = require("../models/PTPackage");
const User = require("../models/User");
const logActivity = require("../utils/activityLogger");
const { fail, r2, istDay } = require("../utils/gym");

// Days that count towards pay: full day = 1, half day = 0.5, paid leave / weekly off / holiday = 1 (the gym pays them).
const PAY_WEIGHT = {
  present: 1,
  late: 1,
  half_day: 0.5,
  paid_leave: 1,
  weekly_off: 1,
  holiday: 1,
  absent: 0,
  unpaid_leave: 0,
};

const monthBounds = (month) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  const now = new Date(Date.now() + 5.5 * 3600000);
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) : now.getUTCMonth() + 1;
  const first = `${y}-${String(mo).padStart(2, "0")}-01`;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const last = `${y}-${String(mo).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
  return {
    start: istDay(first),
    end: istDay(last, true),
    days,
    label: `${y}-${String(mo).padStart(2, "0")}`,
  };
};

const staffList = (req) =>
  User.find({
    ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
    status: "active",
    role:
      req.query.group === "trainer"
        ? "trainer"
        : {
            $nin: [
              "gym_owner",
              "super_admin",
              "member",
              ...(req.query.group === "staff" ? ["trainer"] : []),
            ],
          },
  })
    .select(
      "name role phone monthlySalary trainerProfile branchId createdAt attendanceProfile",
    )
    .sort("name");

// Month grid: every active staff member with their marked days.
const getMonth = asyncHandler(async (req, res) => {
  const b = monthBounds(req.query.month);
  const [staff, rows] = await Promise.all([
    staffList(req),
    StaffAttendance.find({ date: { $gte: b.start, $lte: b.end } }).lean(),
  ]);
  const byUser = new Map();
  for (const r of rows) {
    const k = String(r.userId);
    if (!byUser.has(k)) byUser.set(k, {});
    byUser.get(k)[new Date(r.date.getTime() + 5.5 * 3600000).getUTCDate()] =
      r.status;
  }
  res.json({
    success: true,
    month: b.label,
    days: b.days,
    data: staff.map((u) => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      monthlySalary: u.monthlySalary || 0,
      marks: byUser.get(String(u._id)) || {},
    })),
  });
});

// Day rows for a month (check-in/out times included) + the roster, for the Attendance page. ?group=trainer|staff
const hhmm = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const records = asyncHandler(async (req, res) => {
  const b = monthBounds(req.query.month);
  const [staff, rows] = await Promise.all([
    staffList(req),
    StaffAttendance.find({ date: { $gte: b.start, $lte: b.end } }).lean(),
  ]);
  const ids = new Set(staff.map((u) => String(u._id)));
  const faces = new Set(
    (
      await User.find({
        _id: { $in: [...ids] },
        "faceDescriptor.127": { $exists: true },
      })
        .select("_id")
        .lean()
    ).map((u) => String(u._id)),
  );
  const pins = new Map(
    (
      await User.find({
        _id: { $in: [...ids] },
        biometricId: { $exists: true },
      })
        .select("biometricId")
        .lean()
    ).map((u) => [String(u._id), u.biometricId]),
  );
  res.json({
    success: true,
    month: b.label,
    days: b.days,
    roster: staff.map((u) => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      faceEnrolled: faces.has(String(u._id)),
      biometricId: pins.get(String(u._id)) || "",
      workDays: require("../utils/staffHr").workDays(u.attendanceProfile),
      joined: new Date(u.createdAt.getTime() + 5.5 * 3600000)
        .toISOString()
        .slice(0, 10),
      attendanceProfile: u.attendanceProfile,
    })),
    data: rows
      .filter((r) => ids.has(String(r.userId)))
      .map((r) => ({
        _id: r._id,
        userId: r.userId,
        date: new Date(r.date.getTime() + 5.5 * 3600000)
          .toISOString()
          .slice(0, 10),
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        verifyMode: r.verifyMode || "manual",
        checkInLocation:
          r.checkInLocation?.lat != null ? r.checkInLocation : undefined,
        checkOutLocation:
          r.checkOutLocation?.lat != null ? r.checkOutLocation : undefined,
        hours:
          r.checkIn && r.checkOut
            ? Math.max(0, (hhmm(r.checkOut) - hhmm(r.checkIn)) / 60)
            : 0,
      })),
  });
});

// Mark (or change) one day for one staff member. Idempotent upsert.
const mark = asyncHandler(async (req, res) => {
  const { userId, date, status, checkIn, checkOut, note } = req.body;
  if (!userId || !date || !status)
    throw fail(400, "userId, date and status are required");
  if (!Object.keys(PAY_WEIGHT).includes(status))
    throw fail(400, "Unknown status");
  const user = await User.findOne({ _id: userId, tenantId: req.user.tenantId });
  if (!user) throw fail(404, "Staff member not found");
  const day = istDay(String(date).slice(0, 10));
  if (Number.isNaN(day.getTime())) throw fail(400, "Invalid date");
  const row = await StaffAttendance.findOneAndUpdate(
    { tenantId: req.user.tenantId, userId, date: day },
    {
      $set: {
        status,
        checkIn,
        checkOut,
        note,
        markedBy: req.user._id,
        branchId: user.branchId || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "Staff",
    description: `Marked ${user.name} ${status} on ${String(date).slice(0, 10)}`,
    targetId: row._id,
    ip: req.ip,
  });
  res.json({ success: true, data: row });
});

// Payroll sheet for a month: pro-rata base pay by attendance + trainer commission for PT sessions delivered.
const payroll = asyncHandler(async (req, res) => {
  const b = monthBounds(req.query.month);
  const [staff, rows, pkgs] = await Promise.all([
    staffList(req),
    StaffAttendance.find({ date: { $gte: b.start, $lte: b.end } }).lean(),
    PTPackage.find({
      ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
    }).lean(),
  ]);
  const data = staff.map((u) => {
    const mine = rows.filter((r) => String(r.userId) === String(u._id));
    const payableDays = mine.reduce(
      (s, r) => s + (PAY_WEIGHT[r.status] ?? 0),
      0,
    );
    const count = (st) => mine.filter((r) => r.status === st).length;
    const salary = u.monthlySalary || 0;
    const base = r2((salary * payableDays) / b.days);
    let commission = 0,
      sessions = 0;
    if (u.role === "trainer") {
      for (const p of pkgs) {
        if (String(p.trainerId) !== String(u._id)) continue;
        const done = (p.sessions || []).filter(
          (s) =>
            s.status === "completed" &&
            s.completedAt >= b.start &&
            s.completedAt <= b.end,
        ).length;
        sessions += done;
        commission +=
          (done * p.pricePerSession * (p.commissionPercent || 0)) / 100;
      }
    }
    return {
      userId: u._id,
      name: u.name,
      role: u.role,
      monthlySalary: salary,
      daysInMonth: b.days,
      marked: mine.length,
      present: count("present"),
      halfDays: count("half_day"),
      paidLeave: count("paid_leave"),
      unpaidLeave: count("unpaid_leave"),
      absent: count("absent"),
      payableDays,
      basePay: base,
      ptSessions: sessions,
      commission: r2(commission),
      total: r2(base + commission),
      unmarkedDays: Math.max(0, b.days - mine.length),
    };
  });
  res.json({
    success: true,
    month: b.label,
    data,
    totals: {
      basePay: r2(data.reduce((s, r) => s + r.basePay, 0)),
      commission: r2(data.reduce((s, r) => s + r.commission, 0)),
      total: r2(data.reduce((s, r) => s + r.total, 0)),
    },
  });
});

module.exports = { getMonth, records, mark, payroll };
