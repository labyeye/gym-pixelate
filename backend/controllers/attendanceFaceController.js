const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const AttendanceDeviceLog = require("../models/AttendanceDeviceLog");
const Member = require("../models/Member");
const AttendanceDevice = require("../models/AttendanceDevice");
const { fail } = require("../utils/gym");
const { enrollFace } = require("../utils/faceClient");
const { staffPunch, memberPunch } = require("../utils/punch");
const hr = require("../utils/staffHr");

const KIOSK_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD) || 0.5; // same 128-d dlib distance NestHR uses
const dist = (a, b) => {
  let s = 0;
  for (let i = 0; i < 128; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

// Biometric ID (device PIN) must be unique inside a gym across staff AND members.
async function pinTaken(tenantId, pin, selfId) {
  const [u, m] = await Promise.all([
    User.findOne({ tenantId, biometricId: pin, _id: { $ne: selfId } }).select(
      "_id",
    ),
    Member.findOne({ tenantId, biometricId: pin, _id: { $ne: selfId } }).select(
      "_id",
    ),
  ]);
  return !!(u || m);
}

// Enroll a face photo and/or set the device PIN. Staff route needs Staff update, member route Members update.
const enroll = (kind) =>
  asyncHandler(async (req, res) => {
    const Model = kind === "member" ? Member : User;
    const person = await Model.findOne({
      _id: req.body.id,
      tenantId: req.user.tenantId,
    });
    if (
      !person ||
      (kind === "staff" &&
        (person.role === "member" || person.role === "super_admin"))
    )
      throw fail(404, "Person not found");
    const pin =
      req.body.biometricId === undefined
        ? undefined
        : String(req.body.biometricId).trim();
    if (!req.file && pin === undefined)
      throw fail(400, "Send a face photo or a Biometric ID");
    if (pin && !/^\d{1,9}$/.test(pin))
      throw fail(
        400,
        "Biometric ID is the number shown on the device (digits only)",
      );
    if (pin && (await pinTaken(req.user.tenantId, pin, person._id)))
      throw fail(409, "That Biometric ID is already used by someone else");
    const update = {};
    if (req.file)
      update.$set = {
        faceDescriptor: await enrollFace(
          req.file.buffer,
          req.file.originalname || "face.jpg",
          req.file.mimetype,
        ),
      };
    if (pin) update.$set = { ...update.$set, biometricId: pin };
    if (pin === "") update.$unset = { biometricId: 1 };
    await Model.updateOne({ _id: person._id }, update);
    res.json({
      success: true,
      data: { faceEnrolled: !!req.file || undefined, biometricId: pin },
    });
  });

// Wall-mounted kiosk (a desk / manager login on a spare tablet): who is in this photo? First scan checks in, next checks out.
const kiosk = asyncHandler(async (req, res) => {
  if (!req.file) throw fail(400, "Photo is required");
  const tenantId = req.user.tenantId;
  const s = await hr.getSetting(tenantId);
  const probe = await enrollFace(
    req.file.buffer,
    req.file.originalname || "kiosk.jpg",
    req.file.mimetype,
  );
  const has = { "faceDescriptor.127": { $exists: true } };
  const [staff, members] = await Promise.all([
    User.find({
      tenantId,
      status: "active",
      role: { $nin: ["member", "super_admin"] },
      ...has,
    }).select(
      "+faceDescriptor name role phone branchId tenantId attendanceProfile",
    ),
    hr.moduleOn(s, "member")
      ? Member.find({ tenantId, status: "active", ...has }).select(
          "+faceDescriptor name phone whatsappOptIn erasedAt status branchId tenantId",
        )
      : [],
  ]);
  let best = null;
  let bestD = Infinity;
  for (const [kind, list] of [
    ["staff", staff],
    ["member", members],
  ]) {
    for (const p of list) {
      if (p.faceDescriptor?.length !== 128) continue;
      const d = dist(probe, p.faceDescriptor);
      if (d < bestD) [best, bestD] = [{ kind, p }, d];
    }
  }
  if (!best || bestD > KIOSK_THRESHOLD)
    throw fail(404, "Face not recognised. Enroll the face first");
  if (best.kind === "staff" && !hr.moduleOn(s, best.p.role))
    throw fail(403, "Attendance is turned off for this role");
  const opts = { mode: "face", markedBy: req.user._id };
  const r =
    best.kind === "staff"
      ? await staffPunch(best.p, opts)
      : await memberPunch(best.p, opts);
  res.json({
    success: true,
    data: {
      kind: best.kind,
      name: best.p.name,
      action: r.action,
      time: r.action === "check_in" ? r.row.checkIn : r.row.checkOut,
    },
  });
});

// Biometric terminals (Settings > Attendance devices)
const ONLINE_MS = 5 * 60 * 1000; // devices poll every ~30 s
const listDevices = asyncHandler(async (req, res) => {
  const data = (
    await AttendanceDevice.find({ tenantId: req.user.tenantId })
      .populate("branchId", "name")
      .sort("name")
      .lean()
  ).map((d) => ({
    ...d,
    online:
      !!d.lastSeenAt &&
      Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_MS,
  }));
  res.json({ success: true, data });
});
const deviceLogs = asyncHandler(async (req, res) => {
  const q = {
    tenantId: req.user.tenantId,
    ...(req.query.serial ? { serialNumber: String(req.query.serial) } : {}),
    ...(req.query.kind ? { kind: String(req.query.kind) } : {}),
  };
  const data = await AttendanceDeviceLog.find(q)
    .sort("-createdAt")
    .limit(200)
    .lean();
  res.json({ success: true, data });
});
const addDevice = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const serialNumber = String(req.body.serialNumber || "").trim();
  if (!name || !/^[A-Za-z0-9]{4,40}$/.test(serialNumber))
    throw fail(
      400,
      "Give a name and the device serial number (letters and digits)",
    );
  const data = await AttendanceDevice.create({
    tenantId: req.user.tenantId,
    name,
    serialNumber,
    model: String(req.body.model || "").slice(0, 40),
    branchId: req.body.branchId || null,
  }).catch((e) => {
    throw e.code === 11000
      ? fail(409, "That serial number is already registered")
      : e;
  });
  res.status(201).json({ success: true, data });
});
const removeDevice = asyncHandler(async (req, res) => {
  await AttendanceDevice.deleteOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  res.json({ success: true });
});

// Work schedule / shift / geofence / Biometric ID of one trainer or staff member (the form's Attendance tab).
const saveProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!user || user.role === "member" || user.role === "super_admin")
    throw fail(404, "Person not found");
  const p = req.body.attendanceProfile || {};
  const time = (v) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : "";
  const num = (v, lo, hi) =>
    v !== "" &&
    v !== null &&
    v !== undefined &&
    Number(v) >= lo &&
    Number(v) <= hi
      ? Number(v)
      : undefined;
  const g = p.geofence || {};
  const set = {
    attendanceProfile: {
      workDaysPerWeek: [5, 6, 7].includes(Number(p.workDaysPerWeek))
        ? Number(p.workDaysPerWeek)
        : 6,
      workScheduleType: p.workScheduleType === "custom" ? "custom" : "standard",
      customWorkDays: [
        ...new Set(
          (p.customWorkDays || []).map(Number).filter((d) => d >= 0 && d <= 6),
        ),
      ],
      shiftStart: time(p.shiftStart),
      shiftEnd: time(p.shiftEnd),
      geofence: {
        enabled: !!g.enabled,
        mode: g.mode === "any" ? "any" : "specific",
        lat: num(g.lat, -90, 90),
        lng: num(g.lng, -180, 180),
        radiusMeters: Math.min(
          5000,
          Math.max(20, Number(g.radiusMeters) || 200),
        ),
      },
    },
  };
  if (
    g.enabled &&
    g.mode !== "any" &&
    (set.attendanceProfile.geofence.lat === undefined ||
      set.attendanceProfile.geofence.lng === undefined)
  )
    throw fail(400, "Set the geofence location, or choose 'Any location'");
  const update = { $set: set };
  if (req.body.biometricId !== undefined) {
    const pin = String(req.body.biometricId).trim();
    if (pin && !/^\d{1,9}$/.test(pin))
      throw fail(
        400,
        "Biometric ID is the number shown on the device (digits only)",
      );
    if (pin && (await pinTaken(req.user.tenantId, pin, user._id)))
      throw fail(409, "That Biometric ID is already used by someone else");
    if (pin) set.biometricId = pin;
    else update.$unset = { biometricId: 1 };
  }
  await User.updateOne({ _id: user._id }, update);
  res.json({ success: true });
});

// Give every active trainer / staff member without a Biometric ID the next free number (starting at 1).
const assignIds = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const [users, members] = await Promise.all([
    User.find({ tenantId, biometricId: { $exists: true, $ne: "" } })
      .select("biometricId")
      .lean(),
    Member.find({ tenantId, biometricId: { $exists: true, $ne: "" } })
      .select("biometricId")
      .lean(),
  ]);
  const used = new Set(
    [...users, ...members].map((x) => Number(x.biometricId)),
  );
  const todo = await User.find({
    tenantId,
    status: "active",
    role: { $nin: ["member", "super_admin"] },
    $or: [{ biometricId: { $exists: false } }, { biometricId: "" }],
  })
    .select("_id")
    .sort("createdAt");
  let next = 1;
  for (const u of todo) {
    while (used.has(next)) next++;
    await User.updateOne(
      { _id: u._id },
      { $set: { biometricId: String(next) } },
    );
    used.add(next);
  }
  res.json({ success: true, assigned: todo.length });
});

module.exports = {
  saveProfile,
  assignIds,
  deviceLogs,
  enrollStaff: enroll("staff"),
  enrollMember: enroll("member"),
  kiosk,
  listDevices,
  addDevice,
  removeDevice,
};
