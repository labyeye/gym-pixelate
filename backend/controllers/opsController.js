const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const Enquiry = require("../models/Enquiry");
const Member = require("../models/Member");
const Locker = require("../models/Locker");
const Equipment = require("../models/Equipment");
const Announcement = require("../models/Announcement");
const Membership = require("../models/Membership");
const logActivity = require("../utils/activityLogger");
const {
  fail,
  createInvoice,
  assertCapacity,
  nextCode,
  addDays,
} = require("../utils/gym");

const log = (req, action, module, doc, text) =>
  logActivity({
    user: req.user,
    action,
    module,
    description: text,
    targetId: doc._id,
    ip: req.ip,
  });

/* ------------------------------------------------------------- POS / products */

// Counter sale. Stock is decremented first with a conditional update; if any line can't be fulfilled everything is put back.
const sell = asyncHandler(async (req, res) => {
  const {
    branchId,
    memberId,
    lines,
    discount,
    couponCode,
    payNow,
    payFull,
    method,
    reference,
  } = req.body;
  if (!branchId || !lines?.length)
    throw fail(400, "branchId and at least one product line are required");
  const taken = [];
  try {
    const items = [];
    for (const l of lines) {
      const qty = Number(l.quantity);
      if (!(qty > 0)) throw fail(400, "Quantity must be greater than zero");
      const p = await Product.findOneAndUpdate(
        { _id: l.productId, branchId, isActive: true, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true },
      );
      if (!p) {
        const exists = await Product.findById(l.productId);
        throw fail(
          409,
          exists
            ? `Only ${exists.stock} of ${exists.name} left in stock`
            : "Product not found",
        );
      }
      taken.push({ id: p._id, qty });
      items.push({
        kind: "product",
        refId: p._id,
        description: p.name,
        quantity: qty,
        unitPrice: p.price,
        gstPercent: p.gstPercent,
      });
    }
    const invoice = await createInvoice({
      tenantId: req.user.tenantId,
      branchId,
      memberId: memberId || null,
      items,
      discount,
      couponCode,
      payNow: Number(payNow) || 0,
      payFull: payFull !== false && payNow === undefined,
      method,
      reference,
      userId: req.user._id,
    });
    log(
      req,
      "CREATE",
      "Product",
      invoice,
      `POS sale ${invoice.invoiceNumber} ₹${invoice.totalAmount}`,
    );
    res.status(201).json({ success: true, data: invoice });
  } catch (e) {
    for (const t of taken)
      await Product.updateOne({ _id: t.id }, { $inc: { stock: t.qty } });
    throw e;
  }
});

const adjustStock = asyncHandler(async (req, res) => {
  const delta = Number(req.body.delta);
  if (!Number.isFinite(delta) || delta === 0)
    throw fail(400, "delta must be a non-zero number");
  const p = await Product.findOneAndUpdate(
    { _id: req.params.id, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) },
    { $inc: { stock: delta } },
    { new: true },
  );
  if (!p) throw fail(409, "Product not found or not enough stock to remove");
  log(
    req,
    "UPDATE",
    "Product",
    p,
    `Stock ${delta > 0 ? "+" : ""}${delta} for ${p.name} (${req.body.reason || "adjustment"})`,
  );
  res.json({ success: true, data: p });
});

/* ------------------------------------------------------------------ enquiries */

const addEnquiryNote = asyncHandler(async (req, res) => {
  if (!req.body.text) throw fail(400, "Note text is required");
  const e = await Enquiry.findByIdAndUpdate(
    req.params.id,
    {
      $push: { notes: { text: req.body.text, by: req.user.name } },
      ...(req.body.followUpAt
        ? { $set: { followUpAt: req.body.followUpAt } }
        : {}),
    },
    { new: true },
  );
  if (!e) throw fail(404, "Enquiry not found");
  res.json({ success: true, data: e });
});

// One click from "interested" to a real member (carries name/phone/goal/source; links both ways).
const convertEnquiry = asyncHandler(async (req, res) => {
  const e = await Enquiry.findById(req.params.id);
  if (!e) throw fail(404, "Enquiry not found");
  if (e.convertedMemberId) throw fail(409, "Already converted");
  await assertCapacity(req.user.tenantId, "members");
  const claimed = await Enquiry.findOneAndUpdate(
    { _id: e._id, convertedMemberId: null },
    { $set: { status: "converted" } },
  );
  if (!claimed) throw fail(409, "Already converted");
  try {
    const member = new Member({
      tenantId: req.user.tenantId,
      branchId: e.branchId,
      name: e.name,
      phone: e.phone,
      email: e.email,
      gender: e.gender || undefined,
      source: [
        "walk_in",
        "referral",
        "instagram",
        "facebook",
        "google",
        "website",
        "whatsapp",
        "poster",
      ].includes(e.source)
        ? e.source
        : "other",
      fitness: { goal: "" },
      enquiryId: e._id,
      ...req.body.member,
    });
    member.memberCode = await nextCode(req.user.tenantId, "member", "GYM");
    await member.save();
    await Enquiry.updateOne(
      { _id: e._id },
      { $set: { convertedMemberId: member._id } },
    );
    log(
      req,
      "CREATE",
      "Enquiry",
      e,
      `Converted enquiry ${e.name} → ${member.memberCode}`,
    );
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    await Enquiry.updateOne({ _id: e._id }, { $set: { status: e.status } });
    throw err;
  }
});

/* -------------------------------------------------------------------- lockers */

const assignLocker = asyncHandler(async (req, res) => {
  const { memberId, validTill, months = 1 } = req.body;
  const member = await Member.findById(memberId);
  if (!member) throw fail(404, "Member not found");
  if (await Locker.exists({ memberId, status: "assigned" }))
    throw fail(409, "This member already has a locker");
  const till = validTill
    ? new Date(validTill)
    : addDays(new Date(), 30 * Number(months));
  const l = await Locker.findOneAndUpdate(
    { _id: req.params.id, status: "available" },
    {
      $set: {
        status: "assigned",
        memberId,
        assignedOn: new Date(),
        validTill: till,
      },
    },
    { new: true },
  );
  if (!l) throw fail(409, "Locker is not available");
  log(
    req,
    "UPDATE",
    "Locker",
    l,
    `Assigned locker ${l.number} to ${member.name}`,
  );
  res.json({ success: true, data: l });
});

const releaseLocker = asyncHandler(async (req, res) => {
  const l = await Locker.findOneAndUpdate(
    { _id: req.params.id, status: "assigned" },
    {
      $set: { status: "available", memberId: null },
      $unset: { assignedOn: 1, validTill: 1 },
    },
    { new: true },
  );
  if (!l) throw fail(409, "Locker is not assigned");
  log(req, "UPDATE", "Locker", l, `Released locker ${l.number}`);
  res.json({ success: true, data: l });
});

/* ------------------------------------------------------------------ equipment */

const logService = asyncHandler(async (req, res) => {
  const eq = await Equipment.findById(req.params.id);
  if (!eq) throw fail(404, "Equipment not found");
  const on = req.body.on ? new Date(req.body.on) : new Date();
  eq.serviceLog.push({
    on,
    note: req.body.note,
    cost: Number(req.body.cost) || 0,
    by: req.body.by || req.user.name,
  });
  eq.lastServiceOn = on;
  eq.nextServiceOn = addDays(on, eq.serviceEveryDays || 90);
  if (
    ["under_maintenance", "out_of_order"].includes(eq.status) &&
    req.body.backToWorking !== false
  )
    eq.status = "working";
  await eq.save();
  res.json({ success: true, data: eq });
});

/* -------------------------------------------------------------- announcements */

// What a member should currently see (published, unexpired, pinned first).
const activeAnnouncements = asyncHandler(async (req, res) => {
  const now = new Date();
  const q = {
    publishAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
  };
  res.json({
    success: true,
    data: await Announcement.find(q).sort("-pinned -publishAt").limit(20),
  });
});

module.exports = {
  sell,
  adjustStock,
  addEnquiryNote,
  convertEnquiry,
  assignLocker,
  releaseLocker,
  logService,
  activeAnnouncements,
};
