const Setting = require("../models/Setting");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const StaffAttendance = require("../models/StaffAttendance");
const StaffLeave = require("../models/StaffLeave");
const NotificationLog = require("../models/NotificationLog");
const { runWithTenant } = require("./tenantScope");
const { parsePhone } = require("./phone");
const { sendPlatformTemplate } = require("./whatsappOtp");
const { istDayStart, istHHmm } = require("./gym");

/*
 * Optional staff check-in/out + leave (owner switches it in Settings > Modules > "Staff attendance & leave").
 * WhatsApp messages go on the platform number and use the gym's credits. Each kind has its own owner switch
 * (Setting.reminders.staffCheckin / staffLeave / staffAbsent, all off by default) and an env template with
 * 3 text params [person name, gym name, detail]:
 *   WHATSAPP_STAFF_CHECKIN_TEMPLATE   "Hi {{1}}, you checked {{3}} at {{2}}."        -> staff
 *   WHATSAPP_STAFF_LEAVE_REQUEST_TEMPLATE  "{{1}} asked for leave at {{2}}: {{3}}."   -> owner
 *   WHATSAPP_STAFF_LEAVE_DECISION_TEMPLATE "Hi {{1}}, your leave at {{2}}: {{3}}."    -> staff
 *   WHATSAPP_STAFF_ABSENT_TEMPLATE    "Hi {{1}}, {{2}} has no check-in from you today ({{3}})." -> staff
 * A kind without its template is skipped. Never throws: a WhatsApp problem must not break attendance.
 */
const TEMPLATE = {
  staffCheckin: () => process.env.WHATSAPP_STAFF_CHECKIN_TEMPLATE,
  staffLeaveRequest: () => process.env.WHATSAPP_STAFF_LEAVE_REQUEST_TEMPLATE,
  staffLeaveDecision: () => process.env.WHATSAPP_STAFF_LEAVE_DECISION_TEMPLATE,
  staffAbsent: () => process.env.WHATSAPP_STAFF_ABSENT_TEMPLATE,
};
// which Settings.reminders switch controls each message kind
const SWITCH = {
  staffCheckin: "staffCheckin",
  staffLeaveRequest: "staffLeave",
  staffLeaveDecision: "staffLeave",
  staffAbsent: "staffAbsent",
};

// each group (staff / trainer / member) has its own switch in Settings > Modules; a missing key means ON
const MODULE_OF = { trainer: "trainerAttendance", member: "memberAttendance" };
const moduleOn = (s, role = "staff") =>
  s?.modules?.[MODULE_OF[role] || "staffAttendance"] !== false;
const getSetting = (tenantId) => Setting.findOne({ tenantId }).lean();

async function sendStaffWhatsApp(
  tenantId,
  kind,
  toUser,
  detail,
  s,
  role = toUser?.role,
) {
  try {
    s = s || (await getSetting(tenantId));
    const template = TEMPLATE[kind]();
    if (
      !template ||
      !s ||
      s.whatsappEnabled === false ||
      !moduleOn(s, role) ||
      !s.reminders?.[SWITCH[kind]]
    )
      return "skip";
    const phone = parsePhone(toUser?.phone);
    if (!phone) return "skip";
    const gym =
      s.companyName ||
      (await Tenant.findById(tenantId).select("name").lean())?.name ||
      "your gym";
    await sendPlatformTemplate(
      phone.e164,
      template,
      [toUser.name || "-", gym, detail || "-"],
      process.env.WHATSAPP_REMINDER_TEMPLATE_LANG || "en",
      { tenantId, kind },
    );
    return "sent";
  } catch (e) {
    console.warn("[staffHr] whatsapp", kind, e.message);
    return "failed";
  }
}

// Weekdays (0 = Sunday) this person works; default is Mon-Sat like NestHR.
function workDays(profile) {
  if (profile?.workScheduleType === "custom")
    return profile.customWorkDays || [];
  const n = profile?.workDaysPerWeek ?? 6;
  return n === 5
    ? [1, 2, 3, 4, 5]
    : n === 6
      ? [1, 2, 3, 4, 5, 6]
      : [0, 1, 2, 3, 4, 5, 6];
}
// Late rules as NestHR's defaults: more than 15 min after shift start = late, more than 2 h = half day. No shift set = never late.
const LATE_GRACE_MIN = 15;
const HALF_DAY_LATE_MIN = 120;
function arrivalStatus(profile, hhmm) {
  if (!profile?.shiftStart) return "present";
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const late = m(hhmm) - m(profile.shiftStart);
  return late > HALF_DAY_LATE_MIN
    ? "half_day"
    : late > LATE_GRACE_MIN
      ? "late"
      : "present";
}
// Self check-in rules for one person: their own geofence when switched on, else the gym-wide rules.
function geoFor(user, s) {
  const pg = user?.attendanceProfile?.geofence;
  const gym = s?.attendanceGeo || {};
  if (!pg?.enabled) return gym;
  const any = pg.mode === "any";
  return {
    enabled: true,
    requireFace: gym.requireFace,
    lat: any ? null : pg.lat,
    lng: any ? null : pg.lng,
    radiusMeters: pg.radiusMeters || 200,
  };
}

// every active owner of the gym (they decide leave)
const owners = (tenantId) =>
  User.find({ tenantId, role: "gym_owner", status: "active" }).select(
    "name phone",
  );

// Daily nudge: staff who haven't checked in today (no attendance row, no approved leave). Once per person per day, after 11:00 IST.
// ponytail: no weekly-off schedule, so a staff member's off-day also gets nudged; add a per-staff off-day when asked.
async function runAbsentForGym(s, now = new Date()) {
  const tenantId = s.tenantId;
  if (!s.reminders?.staffAbsent || !TEMPLATE.staffAbsent()) return 0;
  if (Number(istHHmm(now).slice(0, 2)) < 11) return 0;
  const day = istDayStart(now);
  const staff = await User.find({
    tenantId,
    status: "active",
    role: { $nin: ["gym_owner", "super_admin", "member"] },
  }).select("name phone role");
  const marked = new Set(
    (
      await StaffAttendance.find({ tenantId, date: day })
        .select("userId")
        .lean()
    ).map((r) => String(r.userId)),
  );
  const onLeave = new Set(
    (
      await StaffLeave.find({
        tenantId,
        status: "approved",
        startDate: { $lte: day },
        endDate: { $gte: day },
      })
        .select("userId")
        .lean()
    ).map((r) => String(r.userId)),
  );
  let sent = 0;
  for (const u of staff) {
    if (
      !moduleOn(s, u.role) ||
      marked.has(String(u._id)) ||
      onLeave.has(String(u._id))
    )
      continue;
    const refKey = `staffAbsent:${u._id}:${day.toISOString().slice(0, 10)}`;
    try {
      await NotificationLog.create({ tenantId, kind: "staffAbsent", refKey });
    } catch (e) {
      if (e.code === 11000) continue; // already nudged today
      throw e;
    }
    const r = await sendStaffWhatsApp(
      tenantId,
      "staffAbsent",
      u,
      "no check-in yet",
      s,
    );
    await NotificationLog.updateOne(
      { tenantId, refKey },
      { status: r === "sent" ? "sent" : "failed" },
    );
    if (r === "sent") sent++;
  }
  return sent;
}

async function runAbsentAll() {
  const gyms = await Setting.find({ "reminders.staffAbsent": true }).lean();
  for (const s of gyms) {
    try {
      await runWithTenant(s.tenantId, () => runAbsentForGym(s));
    } catch (e) {
      console.error("[staffHr absent]", s.tenantId, e.message);
    }
  }
}

function startStaffAbsentJob() {
  if (process.env.VERCEL || process.env.REMINDERS_AUTO_SEND === "false") return;
  if (!process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN) return;
  setInterval(() => runAbsentAll().catch(() => {}), 3600000).unref();
}

// Member check-in/out message (template params [member name, gym name, "in at 07:15"]); skips opted-out members.
async function sendMemberWhatsApp(tenantId, member, detail) {
  try {
    const s = await getSetting(tenantId);
    const template = process.env.WHATSAPP_MEMBER_CHECKIN_TEMPLATE;
    if (
      !template ||
      !s ||
      s.whatsappEnabled === false ||
      !moduleOn(s, "member") ||
      !s.reminders?.memberCheckin
    )
      return "skip";
    const phone =
      member.whatsappOptIn !== false &&
      !member.erasedAt &&
      parsePhone(member.phone);
    if (!phone) return "skip";
    const gym =
      s.companyName ||
      (await Tenant.findById(tenantId).select("name").lean())?.name ||
      "your gym";
    await sendPlatformTemplate(
      phone.e164,
      template,
      [member.name || "-", gym, detail],
      process.env.WHATSAPP_REMINDER_TEMPLATE_LANG || "en",
      { tenantId, kind: "memberCheckin" },
    );
    return "sent";
  } catch (e) {
    console.warn("[staffHr] member whatsapp", e.message);
    return "failed";
  }
}

module.exports = {
  workDays,
  arrivalStatus,
  geoFor,
  sendMemberWhatsApp,
  moduleOn,
  getSetting,
  sendStaffWhatsApp,
  owners,
  runAbsentForGym,
  startStaffAbsentJob,
};
