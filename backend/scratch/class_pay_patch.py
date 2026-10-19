import io


def edit(p, fn):
    s = io.open(p, newline="", encoding="utf-8").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)


def need(s, a, b):
    assert a in s, a
    return s.replace(a, b, 1)


B = r"D:\projects\Pixelate Nest\NestGym\backend"


def cc(s):
    # 1. sessions builder
    s = need(s, "const getSessions = asyncHandler(async (req, res) => {", "async function buildSessions(req) {")
    s = need(s, "          capacity: c.capacity,\n        });", "          capacity: c.capacity,\n          dropInPrice: c.dropInPrice || 0,\n        });")
    s = need(
        s,
        "  out.sort((a, b) => a.sessionDate - b.sessionDate);\n  res.json({ success: true, count: out.length, data: out });\n});",
        "  out.sort((a, b) => a.sessionDate - b.sessionDate);\n  return out;\n}\nconst getSessions = asyncHandler(async (req, res) => {\n  const out = await buildSessions(req);\n  res.json({ success: true, count: out.length, data: out });\n});",
    )
    # 2. placeBooking extracted from bookClass
    i = s.index("  let booking;\n  try {\n    booking = await ClassBooking.create({")
    j = s.index("  log(\n    req,\n    \"CREATE\",\n    booking,")
    block = s[i:j]
    s = s[:i] + "  const booking = await placeBooking(cls, memberId, when);\n" + s[j:]
    block = block.replace("      status: \"booked\",\n    });", "      status: \"booked\",\n      ...extra,\n    });", 1)
    fn = "// Creates the booking; if two people grab the last seat the later one lands on the waitlist.\nasync function placeBooking(cls, memberId, when, extra = {}) {\n  const classId = cls._id;\n" + block + "  return booking;\n}\n\n"
    k = s.index("const bookClass = asyncHandler(")
    s = s[:k] + fn + s[k:]
    s = need(s, "  bookClass,\n  cancelBooking,", "  bookClass,\n  buildSessions,\n  placeBooking,\n  isScheduled,\n  cancelBooking,")
    return s


edit(B + r"\controllers\classController.js", cc)

edit(
    B + r"\models\ClassBooking.js",
    lambda s: need(
        s,
        "    waitlistPosition: { type: Number, default: null },",
        "    waitlistPosition: { type: Number, default: null },\n    // set when the seat was paid for online (drop-in price); unique so a payment can never book twice\n    paymentId: { type: String },\n    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: \"Invoice\" },",
    ).replace(
        "module.exports =",
        "classBookingSchema.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: \"string\" } } });\n\nmodule.exports =",
        1,
    ),
)


def pc(s):
    s = need(s, 'const { fail, r2, recordPayment } = require("../utils/gym");', 'const GymClass = require("../models/GymClass");\nconst { fail, r2, recordPayment, createInvoice } = require("../utils/gym");')
    s = need(
        s,
        '''const sessions = asyncHandler(async (req, res, next) => {
  await mine(req);
  return classes.getSessions(req, res, next);
});''',
        '''// active memberships (with what the plan includes) that can cover a class on a given date
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
  });
  const booking = await classes.placeBooking(cls, member._id, when, { paymentId: razorpayPaymentId, invoiceId: invoice._id });
  res.status(201).json({ success: true, data: booking, waitlisted: booking.status === "waitlisted" });
});''',
    )
    s = need(s, "  book,\n  cancelBooking,", "  book,\n  classPayOrder,\n  classPayVerify,\n  cancelBooking,")
    return s


edit(B + r"\controllers\portalController.js", pc)
edit(B + r"\routes\portalRoutes.js", lambda s: need(s, 'router.post("/classes/book", c.book);', 'router.post("/classes/book", c.book);\nrouter.post("/classes/pay-order", c.classPayOrder);\nrouter.post("/classes/pay-verify", c.classPayVerify);'))
print("ok")
