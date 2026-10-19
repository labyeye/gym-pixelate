const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const Membership = require("../models/Membership");
const Attendance = require("../models/Attendance");
const ClassBooking = require("../models/ClassBooking");
const WorkoutPlan = require("../models/WorkoutPlan");
const DietPlan = require("../models/DietPlan");
const BodyMeasurement = require("../models/BodyMeasurement");
const TrainerAssignment = require("../models/TrainerAssignment");
const Locker = require("../models/Locker");
const Setting = require("../models/Setting");
const PTPackage = require("../models/PTPackage");
const classes = require("./classController");
const ops = require("./opsController");
const logActivity = require("../utils/activityLogger");
const pay = require("../utils/gymPay");
const { fail, r2, evaluateAccess, recordPayment } = require("../utils/gym");

/* ------------------------------------------------------------ staff side: grant access */

// Creates (or resets) the member's login. The temporary password is returned ONCE for the desk to hand over.
const grantAccess = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw fail(404, "Member not found");
  if (member.status !== "active") throw fail(409, `Member is ${member.status}`);
  const temp = crypto.randomBytes(5).toString("hex"); // 10 chars
  let user = member.userId ? await User.findById(member.userId) : null;
  const created = !user;
  if (user) {
    user.password = temp;
    user.status = "active";
    await user.save();
  } else {
    // a real email the member already has is the nicest login; otherwise a generated one that can't clash across gyms
    const generated = `${String(member.memberCode || member._id).toLowerCase()}.${String(member.tenantId).slice(-6)}@members.nestgym.app`;
    const wanted =
      member.email && !(await User.exists({ email: member.email }))
        ? member.email
        : generated;
    user = await User.create({
      name: member.name,
      email: wanted,
      password: temp,
      role: "member",
      phone: member.phone,
      tenantId: member.tenantId,
      branchId: member.branchId,
    });
    member.userId = user._id;
    await member.save();
  }
  logActivity({
    user: req.user,
    action: "UPDATE",
    module: "Member",
    description: `Portal access ${created ? "created" : "reset"} for ${member.name}`,
    targetId: member._id,
    ip: req.ip,
  });
  res.json({
    success: true,
    data: { login: user.email, password: temp, memberName: member.name },
  });
});

const revokeAccess = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member?.userId) throw fail(404, "This member has no portal access");
  await User.updateOne(
    { _id: member.userId },
    { $set: { status: "inactive" } },
  );
  res.json({ success: true, message: "Portal access disabled" });
});

/* ------------------------------------------------------------------------ member side */

const mine = async (req) => {
  if (req.user.role !== "member")
    throw fail(403, "This area is for gym members");
  const m = await Member.findOne({ userId: req.user._id });
  if (!m)
    throw fail(
      404,
      "Your member profile was not found. Please contact the gym.",
    );
  if (m.status !== "active")
    throw fail(
      403,
      `Your membership account is ${m.status}. Please contact the gym.`,
    );
  return m;
};

const overview = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const [
    access,
    memberships,
    invoices,
    visits30,
    trainers,
    locker,
    pt,
    workout,
    diet,
    setting,
  ] = await Promise.all([
    evaluateAccess(member),
    Membership.find({ memberId: member._id }).sort("-startDate").limit(5),
    Invoice.find({
      memberId: member._id,
      status: { $in: ["pending", "partial"] },
    }),
    Attendance.countDocuments({
      memberId: member._id,
      checkinAt: { $gte: new Date(Date.now() - 30 * 86400000) },
    }),
    TrainerAssignment.find({ memberId: member._id, isActive: true }).populate(
      "trainerId",
      "name phone",
    ),
    Locker.findOne({ memberId: member._id, status: "assigned" }).select(
      "number validTill",
    ),
    PTPackage.find({ memberId: member._id, status: "active" })
      .populate("trainerId", "name")
      .select("name totalSessions sessions trainerId validTill"),
    WorkoutPlan.exists({ memberId: member._id, status: "active" }),
    DietPlan.exists({ memberId: member._id, status: "active" }),
    Setting.findOne({}).select(
      "companyName companyPhone companyAddress onlinePaymentsEnabled gymTiming",
    ),
  ]);
  // hitting today's visit cap means they already trained today — not a problem to show a member
  if (
    !access.allowed &&
    /maximum number of times today/.test(access.reason || "")
  ) {
    access.allowed = true;
    access.warnings = [...(access.warnings || []), "Checked in today ✓"];
    access.reason = undefined;
  }
  const due = r2(
    invoices.reduce((s, i) => s + i.totalAmount - i.paidAmount, 0),
  );
  res.json({
    success: true,
    data: {
      member: {
        name: member.name,
        memberCode: member.memberCode,
        photo: member.photo,
        phone: member.phone,
      },
      gym: {
        name: setting?.companyName,
        phone: setting?.companyPhone,
        address: setting?.companyAddress,
        timing: setting?.gymTiming,
        onlinePayments: !!setting?.onlinePaymentsEnabled,
      },
      access: {
        allowed: access.allowed,
        reason: access.reason,
        warnings: access.warnings,
        membership: access.membership && {
          planName: access.membership.planName,
          startDate: access.membership.startDate,
          endDate: access.membership.endDate,
          status: access.membership.status,
        },
      },
      memberships,
      due,
      visits30,
      trainers,
      locker,
      pt,
      hasWorkout: !!workout,
      hasDiet: !!diet,
    },
  });
});

const invoices = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const data = await Invoice.find({
    memberId: member._id,
    status: { $ne: "cancelled" },
  })
    .sort("-issuedAt")
    .limit(50);
  res.json({ success: true, count: data.length, data });
});

const attendance = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const data = await Attendance.find({ memberId: member._id })
    .sort("-checkinAt")
    .limit(60)
    .select("checkinAt checkoutAt durationMin method");
  res.json({ success: true, count: data.length, data });
});

const plans = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const [workout, diet, measurements] = await Promise.all([
    WorkoutPlan.findOne({ memberId: member._id, status: "active" })
      .sort("-createdAt")
      .populate("trainerId", "name"),
    DietPlan.findOne({ memberId: member._id, status: "active" }).sort(
      "-createdAt",
    ),
    BodyMeasurement.find({ memberId: member._id })
      .sort("-measuredAt")
      .limit(20),
  ]);
  res.json({
    success: true,
    data: { workout, diet, measurements, goal: member.fitness },
  });
});

// Members log their own weigh-ins (trainers see them in Body Progress).
const addMeasurement = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const pick = [
    "weightKg",
    "heightCm",
    "bodyFatPct",
    "waistCm",
    "chestCm",
    "hipsCm",
    "armCm",
    "thighCm",
    "notes",
  ];
  const body = Object.fromEntries(
    pick
      .filter((k) => req.body[k] !== undefined && req.body[k] !== "")
      .map((k) => [k, req.body[k]]),
  );
  if (!Object.keys(body).length)
    throw fail(400, "Enter at least one measurement");
  const doc = await BodyMeasurement.create({
    ...body,
    tenantId: member.tenantId,
    memberId: member._id,
    recordedBy: req.user._id,
  });
  res.status(201).json({ success: true, data: doc });
});

const myBookings = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const data = await ClassBooking.find({
    memberId: member._id,
    sessionDate: { $gte: new Date() },
    status: { $in: ["booked", "waitlisted"] },
  })
    .sort("sessionDate")
    .populate("classId", "name room durationMin");
  res.json({ success: true, count: data.length, data });
});

const sessions = asyncHandler(async (req, res, next) => {
  await mine(req);
  return classes.getSessions(req, res, next);
});

const book = asyncHandler(async (req, res, next) => {
  const member = await mine(req);
  req.body = {
    classId: req.body.classId,
    sessionDate: req.body.sessionDate,
    memberId: member._id,
  }; // never trust a client memberId
  return classes.bookClass(req, res, next);
});

const cancelBooking = asyncHandler(async (req, res, next) => {
  const member = await mine(req);
  const b = await ClassBooking.findOne({
    _id: req.params.id,
    memberId: member._id,
  });
  if (!b) throw fail(404, "Booking not found");
  return classes.cancelBooking(req, res, next);
});

const announcements = asyncHandler(async (req, res, next) => {
  await mine(req);
  return ops.activeAnnouncements(req, res, next);
});

/* -------------------------------------------------------------------- online payment */

const createPayOrder = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const inv = await Invoice.findOne({
    _id: req.params.id,
    memberId: member._id,
    status: { $in: ["pending", "partial"] },
  });
  if (!inv) throw fail(404, "Nothing to pay on this invoice");
  const balance = r2(inv.totalAmount - inv.paidAmount);
  const amount =
    req.body.amount === undefined ? balance : r2(Number(req.body.amount));
  if (!(amount >= 1) || amount > balance + 0.005)
    throw fail(400, `Enter an amount between ₹1 and ₹${balance}`);
  const creds = await pay.getCreds(member.tenantId);
  const order = await pay.api.createOrder(creds, {
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: inv.invoiceNumber.slice(0, 40),
    notes: { invoiceId: String(inv._id), memberId: String(member._id) },
  });
  res.json({
    success: true,
    data: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || "INR",
      key: creds.keyId,
      invoiceNumber: inv.invoiceNumber,
      name: member.name,
      phone: member.phone,
      email: member.email,
    },
  });
});

// Signature check + server-side fetch of the payment, so the amount can't be forged by the browser.
const verifyPayment = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
    throw fail(400, "Missing payment details");
  const inv = await Invoice.findOne({
    _id: req.params.id,
    memberId: member._id,
  });
  if (!inv) throw fail(404, "Invoice not found");
  const creds = await pay.getCreds(member.tenantId);
  if (
    !pay.verifySignature(
      creds.keySecret,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    )
  )
    throw fail(400, "Payment signature is invalid");
  const p = await pay.api.fetchPayment(creds, razorpayPaymentId);
  if (
    !p ||
    p.order_id !== razorpayOrderId ||
    !["captured", "authorized"].includes(p.status)
  )
    throw fail(400, "Payment was not completed");
  if (p.notes?.invoiceId && String(p.notes.invoiceId) !== String(inv._id))
    throw fail(400, "Payment belongs to a different invoice");
  const updated = await recordPayment(member.tenantId, inv._id, {
    amount: p.amount / 100,
    method: "online",
    reference: razorpayPaymentId,
    idempotencyKey: `rzp:${razorpayPaymentId}`,
    userId: req.user._id,
    note: "Paid online from member portal",
  });
  logActivity({
    user: req.user,
    action: "PAYMENT",
    module: "Invoice",
    description: `${member.name} paid ₹${p.amount / 100} online on ${updated.invoiceNumber}`,
    targetId: updated._id,
    ip: req.ip,
  });
  res.json({ success: true, data: updated });
});

module.exports = {
  grantAccess,
  revokeAccess,
  overview,
  invoices,
  attendance,
  plans,
  addMeasurement,
  myBookings,
  sessions,
  book,
  cancelBooking,
  announcements,
  createPayOrder,
  verifyPayment,
};
