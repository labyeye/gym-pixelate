const StaffAttendance = require("../models/StaffAttendance");
const MemberAttendance = require("../models/MemberAttendance");
const Membership = require("../models/Membership");
const { fail, istDayStart, istHHmm } = require("./gym");
const hr = require("./staffHr");

/*
 * One place that turns "this person punched" into an attendance row, whatever the source:
 *   mode = manual (desk) | self | geo | face | geo_camera (selfie + GPS) | biometric (ZKTeco-style device push)
 * action = "check_in" | "check_out" | "toggle" (first scan in, next scan out; used by the face kiosk and devices).
 * Returns { action, row }. WhatsApp is sent here too, so every source gets the same messages.
 */
const MIN_GAP_MS = 60 * 1000; // a face lingering at the kiosk must not check the person straight back out
const HALF_DAY_MINUTES = 240; // out before 4h of work -> half day (same as NestHR)
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function pick(action, row, now) {
  if (action !== "toggle") return action;
  if (!row?.checkIn) return "check_in";
  if (row.checkOut) throw fail(400, `Already checked out at ${row.checkOut}`);
  if (now - new Date(row.updatedAt).getTime() < MIN_GAP_MS)
    throw fail(400, `Already checked in at ${row.checkIn}`);
  return "check_out";
}

async function staffPunch(
  user,
  {
    action = "toggle",
    mode = "manual",
    location,
    at = new Date(),
    markedBy,
  } = {},
) {
  const key = {
    tenantId: user.tenantId,
    userId: user._id,
    date: istDayStart(at),
  };
  const row = await StaffAttendance.findOne(key);
  const act = pick(action, row, at.getTime());
  const time = istHHmm(at);
  let saved;
  if (act === "check_in") {
    if (row?.checkIn) throw fail(400, `Already checked in at ${row.checkIn}`);
    if (row && row.status.endsWith("_leave"))
      throw fail(400, "On approved leave today");
    saved = await StaffAttendance.findOneAndUpdate(
      key,
      {
        $set: {
          status: hr.arrivalStatus(user.attendanceProfile, time),
          checkIn: time,
          verifyMode: mode,
          checkInLocation: location,
          markedBy: markedBy || user._id,
          branchId: user.branchId || null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } else {
    if (!row?.checkIn) throw fail(400, "Check in first");
    if (row.checkOut) throw fail(400, `Already checked out at ${row.checkOut}`);
    row.checkOut = time;
    if (location) row.checkOutLocation = location;
    if (mins(time) - mins(row.checkIn) < HALF_DAY_MINUTES)
      row.status = "half_day";
    saved = await row.save();
  }
  hr.sendStaffWhatsApp(
    user.tenantId,
    "staffCheckin",
    user,
    `${act === "check_in" ? "in" : "out"} at ${time}`,
  );
  return { action: act, row: saved };
}

async function memberPunch(
  member,
  {
    action = "toggle",
    mode = "manual",
    location,
    at = new Date(),
    markedBy,
  } = {},
) {
  if (!member || member.erasedAt) throw fail(404, "Member not found");
  const key = {
    tenantId: member.tenantId,
    memberId: member._id,
    date: istDayStart(at),
  };
  const row = await MemberAttendance.findOne(key);
  const act = pick(action, row, at.getTime());
  const time = istHHmm(at);
  let saved;
  if (act === "check_in") {
    if (member.status !== "active") throw fail(400, "Member is not active");
    if (row) throw fail(400, `Already checked in at ${row.checkIn}`);
    const hasPlan = await Membership.exists({
      tenantId: member.tenantId,
      memberId: member._id,
      status: "active",
      startDate: { $lte: at },
      endDate: { $gt: at },
    });
    if (!hasPlan) throw fail(400, "No active membership. Renew the plan first");
    saved = await MemberAttendance.create({
      ...key,
      checkIn: time,
      verifyMode: mode,
      checkInLocation: location,
      markedBy,
      branchId: member.branchId || null,
    });
  } else {
    if (!row) throw fail(400, "Not checked in today");
    if (row.checkOut) throw fail(400, `Already checked out at ${row.checkOut}`);
    row.checkOut = time;
    if (location) row.checkOutLocation = location;
    saved = await row.save();
  }
  hr.sendMemberWhatsApp(
    member.tenantId,
    member,
    `${act === "check_in" ? "in" : "out"} at ${time}`,
  );
  return { action: act, row: saved };
}

module.exports = { staffPunch, memberPunch };
