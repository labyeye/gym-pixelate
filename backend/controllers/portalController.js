const crypto = require("crypto");
const { generatePassword } = require("../utils/passwordPolicy");
const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const Membership = require("../models/Membership");
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
const GymClass = require("../models/GymClass");
const { fail, r2, recordPayment, createInvoice, sellMembership } = require("../utils/gym");
const MembershipPlan = require("../models/MembershipPlan");
const membershipCtl = require("./membershipController");

/* ------------------------------------------------------------ staff side: grant access */

// Creates (or resets) the member's login. The temporary password is returned ONCE for the desk to hand over.
const grantAccess = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw fail(404, "Member not found");
  if (member.status !== "active") throw fail(409, `Member is ${member.status}`);
  const temp = generatePassword(10); // typed in by the desk
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
    memberships,
    invoices,
    trainers,
    locker,
    pt,
    workout,
    diet,
    setting,
  ] = await Promise.all([
    Membership.find({ memberId: member._id }).sort("-startDate").limit(5),
    Invoice.find({
      memberId: member._id,
      status: { $in: ["pending", "partial"] },
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
  // Membership status shown on the member's home card (no gate/check-in any more, just "is my plan running").
  const now = new Date();
  const current = memberships.find(
    (m) => ["active", "frozen"].includes(m.status) && m.endDate >= now,
  );
  const warnings = [];
  if (current) {
    const daysLeft = Math.ceil((current.endDate - now) / 86400000);
    if (current.status === "frozen") warnings.push("Membership is frozen");
    else if (daysLeft <= 7)
      warnings.push(`Membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
  }
  const access = {
    allowed: !!current && current.status === "active" && member.status === "active",
    reason: current ? undefined : "No active membership",
    warnings,
    membership: current || null,
  };
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

// One 0-10 rating (+ optional comment) per member per 30 days.
const addFeedback = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const score = Number(req.body?.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) throw fail(400, "Pick a score from 0 to 10");
  const Feedback = require("../models/Feedback");
  if (await Feedback.exists({ memberId: member._id, createdAt: { $gt: new Date(Date.now() - 30 * 86400000) } }))
    throw fail(429, "Thanks, you already rated us this month");
  await Feedback.create({ tenantId: member.tenantId, memberId: member._id, score, comment: String(req.body?.comment || "").slice(0, 500) });
  res.status(201).json({ success: true });
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

// active memberships (with what the plan includes) that can cover a class on a given date
const classCover = async (memberId) =>
  Membership.find({ memberId, status: "active" }).populate("planId", "includes");
const covers = (list, when) =>
  list.filter((m) => m.startDate <= when && m.endDate >= when);

// Sessions + what this member pays: price 0 = included in the plan, price > 0 = pay the drop-in fee online to book.
const sessions = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const [out, ms, s] = await Promise.all([
    classes.buildSessions(req),
    classCover(member._id),
    Setting.findOne({ tenantId: member.tenantId }).select("onlinePaymentsEnabled").lean(),
  ]);
  for (const x of out) {
    const live = covers(ms, new Date(x.sessionDate));
    const included = live.some((m) => m.planId?.includes?.classes);
    x.hasMembership = live.length > 0;
    x.price = included ? 0 : x.dropInPrice;
  }
  res.json({ success: true, count: out.length, onlinePayments: !!s?.onlinePaymentsEnabled, data: out });
});

// Pay the drop-in fee for one session with the gym's own Razorpay, then book it (see classPayVerify).
const classPayOrder = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const when = new Date(req.body.sessionDate);
  const cls = await GymClass.findOne({ _id: req.body.classId, isActive: true });
  if (!cls) throw fail(404, "Class not found");
  if (!(cls.dropInPrice > 0)) throw fail(400, "This class has no drop-in fee");
  if (when < new Date()) throw fail(400, "That session has already started");
  if (!classes.isScheduled(cls, when)) throw fail(400, `${cls.name} does not run at that time`);
  const live = covers(await classCover(member._id), when);
  if (!live.length) throw fail(403, "You need an active membership on that date");
  if (live.some((m) => m.planId?.includes?.classes)) throw fail(409, "This class is already included in your plan, just book it");
  const creds = await pay.getCreds(member.tenantId);
  const order = await pay.api.createOrder(creds, {
    amount: Math.round(cls.dropInPrice * 100),
    currency: "INR",
    receipt: `CLS${Date.now()}`.slice(0, 40),
    notes: { kind: "class", classId: String(cls._id), memberId: String(member._id), sessionDate: when.toISOString() },
  });
  res.json({
    success: true,
    data: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || "INR",
      key: creds.keyId,
      description: `${cls.name} — drop-in`,
      name: member.name,
      phone: member.phone,
      email: member.email,
    },
  });
});

const classPayVerify = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) throw fail(400, "Missing payment details");
  const creds = await pay.getCreds(member.tenantId);
  if (!pay.verifySignature(creds.keySecret, razorpayOrderId, razorpayPaymentId, razorpaySignature)) throw fail(400, "Payment signature is invalid");
  const p = await pay.api.fetchPayment(creds, razorpayPaymentId);
  if (!p || p.order_id !== razorpayOrderId || !["captured", "authorized"].includes(p.status)) throw fail(400, "Payment was not completed");
  const n = p.notes || {};
  if (n.kind !== "class" || String(n.memberId) !== String(member._id)) throw fail(400, "Payment does not belong to this booking");
  const dup = await ClassBooking.findOne({ paymentId: razorpayPaymentId });
  if (dup) return res.json({ success: true, data: dup, waitlisted: dup.status === "waitlisted" });
  const cls = await GymClass.findById(n.classId);
  if (!cls) throw fail(404, "Class not found");
  if (Math.round(cls.dropInPrice * 100) !== Number(p.amount)) throw fail(400, "Paid amount does not match the class fee");
  const when = new Date(n.sessionDate);
  const invoice = await createInvoice({
    tenantId: member.tenantId,
    branchId: cls.branchId,
    memberId: member._id,
    items: [{ kind: "other", description: `${cls.name} drop-in (${when.toLocaleDateString("en-IN")})`, quantity: 1, unitPrice: cls.dropInPrice, gstPercent: 0 }],
    payFull: true,
    method: "online",
    reference: razorpayPaymentId,
    userId: member.userId,
    idempotencyKey: `rzp-class:${razorpayPaymentId}`,
  });
  const booking = await classes.placeBooking(cls, member._id, when, { paymentId: razorpayPaymentId, invoiceId: invoice._id });
  res.status(201).json({ success: true, data: booking, waitlisted: booking.status === "waitlisted" });
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

// ── Changing plan (member side) ──────────────────────────────────────────
// Members may switch to a dearer plan within 24 h of buying; they pay only the difference.
// After that the gym owner / manager does it (and the member is told so).
const currentActive = (memberId) =>
  Membership.findOne({ memberId, status: "active", endDate: { $gt: new Date() } }).sort("-createdAt");

const changeOptions = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const cur = await currentActive(member._id);
  if (!cur)
    return res.json({ success: true, data: { canChange: false, reason: "You have no running membership." } });
  const withinWindow = Date.now() - cur.createdAt <= membershipCtl.CHANGE_WINDOW_MS;
  if (!withinWindow)
    return res.json({
      success: true,
      data: {
        canChange: false,
        current: { planName: cur.planName },
        reason: "Plan changes after 24 hours are handled by the gym. Please contact the front desk.",
      },
    });
  const plans = await MembershipPlan.find({
    isActive: true,
    _id: { $ne: cur.planId },
    price: { $gte: cur.price },
  }).sort("price");
  const options = [];
  for (const p of plans) {
    const q = await membershipCtl.quoteUpgrade(cur, p);
    options.push({
      _id: p._id,
      name: p.name,
      durationDays: p.durationDays,
      price: p.price,
      newTotal: q.newTotal,
      credit: q.credit,
      payable: q.payable,
    });
  }
  res.json({
    success: true,
    data: {
      canChange: true,
      current: { planName: cur.planName, paid: cur.paidAmount },
      windowEndsAt: new Date(cur.createdAt.getTime() + membershipCtl.CHANGE_WINDOW_MS),
      options,
    },
  });
});

// Creates the new membership with only the difference billed; the member then pays that invoice online or at the desk.
const changePlan = asyncHandler(async (req, res) => {
  const member = await mine(req);
  const plan = await MembershipPlan.findOne({ _id: req.body.planId, isActive: true });
  if (!plan) throw fail(404, "Plan not found");
  const cur = await currentActive(member._id);
  if (!cur) throw fail(409, "You have no running membership to change");
  if (Date.now() - cur.createdAt > membershipCtl.CHANGE_WINDOW_MS)
    throw fail(403, "Plan changes after 24 hours are handled by the gym. Please contact the front desk.");
  if (String(cur.planId) === String(plan._id) || plan.price < cur.price)
    throw fail(400, "Pick a higher plan than your current one");
  const old = await Membership.findOneAndUpdate(
    { _id: cur._id, status: "active" },
    { $set: { status: "upgraded" } },
    { new: false },
  );
  if (!old) throw fail(409, "Your membership just changed. Please refresh.");
  try {
    const r = await membershipCtl.performUpgrade({
      old,
      plan,
      userId: req.user._id,
      tenantId: member.tenantId,
    });
    logActivity({
      user: req.user,
      action: "CREATE",
      module: "Membership",
      description: `${member.name} changed plan to ${plan.name} within 24h (credit ₹${r.credit}, ${r.invoice.invoiceNumber})`,
      targetId: r.membership._id,
      ip: req.ip,
    });
    res.status(201).json({
      success: true,
      data: { membership: r.membership, invoice: r.invoice, credit: r.credit, payable: r.payable },
    });
  } catch (e) {
    await Membership.updateOne({ _id: old._id }, { $set: { status: "active" } });
    throw e;
  }
});

// ── Renewing an expired membership (member side) ─────────────────────────
// Open to a member who has no running membership; any active plan can be picked (their last one first).
const LIVE = ["active", "frozen", "upcoming"];
const runningFor = (memberId) =>
  Membership.findOne({ memberId, status: { $in: LIVE }, endDate: { $gt: new Date() } });

const renewOptions = asyncHandler(async (req, res) => {
  const member = await mine(req);
  if (await runningFor(member._id)) return res.json({ success: true, data: { canRenew: false } });
  const last = await Membership.findOne({ memberId: member._id, status: { $in: [...LIVE, "expired"] } }).sort("-endDate");
  const plans = await MembershipPlan.find({ isActive: true }).sort("price");
  const options = plans.map((p) => {
    const g = p.gstPercent || 0;
    const unit = r2(p.priceIncludesGst ? p.price / (1 + g / 100) : p.price);
    return {
      _id: p._id,
      name: p.name,
      durationDays: p.durationDays,
      price: p.price,
      total: r2(unit + r2(unit * (g / 100))),
      last: !!last && String(last.planId) === String(p._id),
    };
  });
  options.sort((a, b) => Number(b.last) - Number(a.last));
  res.json({
    success: true,
    data: { canRenew: options.length > 0, expiredOn: last?.endDate || null, lastPlan: last?.planName || null, options },
  });
});

// Bills the plan and starts it now; the member pays the invoice online or at the desk.
const renewPlan = asyncHandler(async (req, res) => {
  const member = await mine(req);
  if (await runningFor(member._id)) throw fail(409, "Your membership is still running");
  const plan = await MembershipPlan.findOne({ _id: req.body.planId, isActive: true });
  if (!plan) throw fail(404, "Plan not found");
  const last = await Membership.findOne({ memberId: member._id, status: { $in: [...LIVE, "expired"] } }).sort("-endDate");
  const { membership, invoice } = await sellMembership({
    tenantId: member.tenantId,
    branchId: last?.branchId,
    memberId: member._id,
    planId: plan._id,
    includeAdmission: false,
    payNow: 0,
    userId: req.user._id,
    isRenewal: true,
    previousMembershipId: last?._id || null,
    idempotencyKey: req.body.idempotencyKey,
  });
  logActivity({
    user: req.user,
    action: "CREATE",
    module: "Membership",
    description: `${member.name} renewed ${plan.name} from the member app (${invoice.invoiceNumber})`,
    targetId: membership._id,
    ip: req.ip,
  });
  res.status(201).json({ success: true, data: { membership, invoice } });
});

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
  addFeedback,
  grantAccess,
  revokeAccess,
  overview,
  invoices,
  plans,
  addMeasurement,
  myBookings,
  sessions,
  book,
  classPayOrder,
  classPayVerify,
  cancelBooking,
  announcements,
  createPayOrder,
  verifyPayment,
  changeOptions,
  changePlan,
  renewOptions,
  renewPlan,
};
