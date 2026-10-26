const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const Membership = require("../models/Membership");
const Invoice = require("../models/Invoice");
const ClassBooking = require("../models/ClassBooking");
const BodyMeasurement = require("../models/BodyMeasurement");
const { ConsentLog, WaiverTemplate, SignedWaiver } = require("../models/Privacy");
const { anonymizeMember } = require("../utils/privacy");
const logActivity = require("../utils/activityLogger");
const { fail } = require("../utils/gym");

const getMemberOr404 = async (id) => {
  const m = await Member.findById(id);
  if (!m) throw fail(404, "Member not found");
  return m;
};
const log = (req, action, text, targetId) =>
  logActivity({ user: req.user, action, module: "Privacy", description: text, targetId, ip: req.ip });

// Right of access: everything we hold on one member, as a JSON download.
const exportMember = asyncHandler(async (req, res) => {
  const m = await getMemberOr404(req.params.id);
  const q = { memberId: m._id };
  const [memberships, invoices, bookings, measurements, consents, waivers] = await Promise.all([
    Membership.find(q).lean(),
    Invoice.find(q).lean(),
    ClassBooking.find(q).lean(),
    BodyMeasurement.find(q).lean(),
    ConsentLog.find(q).lean(),
    SignedWaiver.find(q).lean(),
  ]);
  log(req, "EXPORT", `Exported personal data of ${m.name}`, m._id);
  res.setHeader("Content-Disposition", `attachment; filename="member-${m.memberCode || m._id}.json"`);
  res.json({ success: true, exportedAt: new Date(), member: m.toJSON(), memberships, invoices, bookings, measurements, consents, waivers });
});

// Right to erasure. The phone number has to be typed back as a safety check (no accidental wipes).
const eraseMember = asyncHandler(async (req, res) => {
  const m = await getMemberOr404(req.params.id);
  if (m.erasedAt) throw fail(400, "Already erased");
  if (String(req.body?.confirmPhone || "").trim() !== m.phone) throw fail(400, "Type the phone number to confirm");
  const name = m.name;
  await anonymizeMember(m);
  await ConsentLog.create({ tenantId: m.tenantId, memberId: m._id, purpose: "data_processing", granted: false, source: "erasure", by: req.user._id, ip: req.ip });
  log(req, "DELETE", `Erased personal data of ${name}`, m._id);
  res.json({ success: true, message: "Personal data erased. Invoices are kept for tax records." });
});

const PURPOSES = ["data_processing", "marketing", "whatsapp", "health_data", "photo"];
const addConsent = asyncHandler(async (req, res) => {
  const m = await getMemberOr404(req.params.id);
  const { purpose, granted } = req.body || {};
  if (!PURPOSES.includes(purpose) || typeof granted !== "boolean") throw fail(400, "purpose and granted are required");
  const row = await ConsentLog.create({ tenantId: m.tenantId, memberId: m._id, purpose, granted, source: "staff", by: req.user._id, ip: req.ip });
  if (purpose === "whatsapp" || purpose === "marketing") await Member.updateOne({ _id: m._id }, { whatsappOptIn: granted });
  res.status(201).json({ success: true, data: row });
});
const listConsents = asyncHandler(async (req, res) => {
  const m = await getMemberOr404(req.params.id);
  res.json({ success: true, data: await ConsentLog.find({ memberId: m._id }).sort("-createdAt").limit(200) });
});

// ── digital waiver ──
const getWaiver = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await WaiverTemplate.findOne({}) });
});
const saveWaiver = asyncHandler(async (req, res) => {
  const body = String(req.body?.body || "").trim();
  if (body.length < 20) throw fail(400, "Waiver text is too short");
  const cur = await WaiverTemplate.findOne({});
  const data = cur
    ? await WaiverTemplate.findOneAndUpdate(
        {},
        { body, title: req.body.title || cur.title, version: cur.body === body ? cur.version : cur.version + 1 },
        { new: true },
      )
    : await WaiverTemplate.create({ tenantId: req.user.tenantId, body, title: req.body?.title });
  res.json({ success: true, data });
});
const memberWaivers = asyncHandler(async (req, res) => {
  const m = await getMemberOr404(req.params.id);
  const [template, signed] = await Promise.all([WaiverTemplate.findOne({}), SignedWaiver.find({ memberId: m._id }).sort("-createdAt")]);
  res.json({ success: true, data: { template, signed, upToDate: !!template && signed.some((s) => s.version === template.version) } });
});
const signWaiver = asyncHandler(async (req, res) => {
  const m = await getMemberOr404(req.params.id);
  const tpl = await WaiverTemplate.findOne({});
  if (!tpl) throw fail(400, "Set up the waiver text first");
  const signedName = String(req.body?.signedName || "").trim();
  if (signedName.length < 2) throw fail(400, "Type the full name to sign");
  const row = await SignedWaiver.create({
    tenantId: m.tenantId,
    memberId: m._id,
    version: tpl.version,
    bodySnapshot: tpl.body,
    signedName,
    method: req.body?.method === "portal" ? "portal" : "in_person",
    by: req.user._id,
    ip: req.ip,
  });
  await Member.updateOne({ _id: m._id }, { "health.declarationSignedAt": new Date() });
  await ConsentLog.create({ tenantId: m.tenantId, memberId: m._id, purpose: "health_data", granted: true, source: "waiver", by: req.user._id, ip: req.ip });
  res.status(201).json({ success: true, data: row });
});

module.exports = { exportMember, eraseMember, addConsent, listConsents, getWaiver, saveWaiver, memberWaivers, signWaiver };
