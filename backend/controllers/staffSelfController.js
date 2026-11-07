const asyncHandler = require("express-async-handler");
const StaffAttendance = require("../models/StaffAttendance");
const User = require("../models/User");
const { fail, istDayStart } = require("../utils/gym");
const { staffPunch } = require("../utils/punch");
const { verifyFace } = require("../utils/faceClient");
const hr = require("../utils/staffHr");
const leaveCtl = require("./staffLeaveController");

const isStaff = (u) => u.role !== "member" && u.role !== "super_admin";
// feature switch + staff-only guard, shared by every self-service route
const gate = async (req) => {
  const s = await hr.getSetting(req.user.tenantId);
  if (!hr.moduleOn(s, req.user.role))
    throw fail(
      403,
      "Attendance & leave is turned off for your role in this gym",
    );
  if (!isStaff(req.user)) throw fail(403, "Staff only");
  return s;
};
const fmtDay = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

// Today's row + this year's leave balance for the signed-in staff member.
const me = asyncHandler(async (req, res) => {
  await gate(req);
  const today = istDayStart();
  const s = await hr.getSetting(req.user.tenantId);
  const row = await StaffAttendance.findOne({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    date: today,
  }).lean();
  const balance = await leaveCtl.balanceOf(
    req.user.tenantId,
    req.user._id,
    s,
    leaveCtl.yearStartOf(new Date(Date.now() + 5.5 * 3600000).toISOString()),
  );
  const geo = hr.geoFor(req.user, s);
  res.json({
    success: true,
    data: {
      today: row || null,
      balance,
      geo: { enabled: !!geo.enabled, requireFace: !!geo.requireFace },
    },
  });
});

// Great-circle distance in metres (same formula as NestHR).
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Self punch. The gym's rules (Settings > Attendance) decide what is needed: GPS inside the fence, and/or a selfie
// that matches the enrolled face. Location is always re-checked here, never trusted from the browser.
const selfPunch = (action) =>
  asyncHandler(async (req, res) => {
    const s = await gate(req);
    const geo = hr.geoFor(req.user, s);
    let location;
    if (geo.enabled) {
      const lat = parseFloat(req.body.lat);
      const lng = parseFloat(req.body.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng))
        throw fail(400, "Turn on location to check in");
      const accuracy = req.body.accuracy
        ? parseFloat(req.body.accuracy)
        : undefined;
      const hasFence = geo.lat != null && geo.lng != null;
      const distanceMeters = hasFence
        ? haversineMeters(lat, lng, geo.lat, geo.lng)
        : undefined;
      if (hasFence && distanceMeters > (geo.radiusMeters || 200))
        throw fail(
          403,
          `You are ${Math.round(distanceMeters)}m away from the gym (allowed ${geo.radiusMeters || 200}m)`,
        );
      location = { lat, lng, accuracy, distanceMeters };
    }
    if (geo.requireFace) {
      if (!req.file) throw fail(400, "Selfie is required");
      const me = await User.findById(req.user._id).select("+faceDescriptor");
      if (me?.faceDescriptor?.length !== 128)
        throw fail(
          400,
          "Your face is not enrolled. Ask the owner to enroll it",
        );
      const { match, distance } = await verifyFace(
        req.file.buffer,
        req.file.originalname || "selfie.jpg",
        req.file.mimetype,
        me.faceDescriptor,
      );
      if (!match)
        throw fail(
          403,
          `Face does not match (distance ${distance.toFixed(2)})`,
        );
    }
    const mode = geo.requireFace
      ? geo.enabled
        ? "geo_camera"
        : "face"
      : geo.enabled
        ? "geo"
        : "self";
    const { row } = await staffPunch(req.user, { action, mode, location });
    res.json({ success: true, data: row });
  });
const checkIn = selfPunch("check_in");
const checkOut = selfPunch("check_out");

module.exports = { me, checkIn, checkOut, ...leaveCtl };
