const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Tenant = require("../models/Tenant");
const SupportTicket = require("../models/SupportTicket");
const { pushTicket } = require("../utils/finalPixelatePush");

// Express 4 doesn't catch async rejections
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => res.status(500).json({ message: e.message }));

const safeEq = (a = "", b = "") => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Called by final-pixelate when its team replies / changes status. Shared-secret guarded, no JWT.
const STATUS = {
  new: "open",
  in_progress: "in_progress",
  resolved: "resolved",
  closed: "closed",
};
router.post(
  "/webhook/:id",
  wrap(async (req, res) => {
    const secret = process.env.FINAL_PIXELATE_SECRET;
    if (!secret || !safeEq(req.headers["x-api-key"], secret))
      return res.status(401).json({ message: "Unauthorized" });
    if (!/^[a-f\d]{24}$/i.test(req.params.id))
      return res.status(404).json({ message: "Not found" });
    const t = await SupportTicket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Not found" });
    const { status, message, senderName } = req.body;
    if (STATUS[status]) t.status = STATUS[status];
    if (message && String(message).trim())
      t.replies.push({
        message: String(message).trim(),
        from: "platform",
        senderName: senderName || "Pixelate Nest Support",
      });
    await t.save();
    res.json({ success: true });
  }),
);

// Tenant-scoped automatically by the tenantScope plugin (tenantId forced on every query).
router.use(protect);

router.get(
  "/",
  wrap(async (req, res) => {
    const data = await SupportTicket.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const { subject, description, priority } = req.body;
    if (!subject?.trim() || !description?.trim())
      return res
        .status(400)
        .json({ message: "Subject and description are required" });
    const tenant = await Tenant.findById(req.user.tenantId)
      .select("name")
      .lean();
    const t = await SupportTicket.create({
      tenantId: req.user.tenantId,
      subject: subject.trim(),
      description: description.trim(),
      priority: ["low", "medium", "high", "critical"].includes(priority)
        ? priority
        : "medium",
      companyName: tenant?.name || req.user.name || "",
      contactEmail: req.user.email || "",
      contactPhone: req.user.phone || "",
    });
    res.status(201).json({ success: true, data: t });
    pushTicket(t);
  }),
);

// Gym follow-up on its own ticket; reopens it and shows up as a comment in the dashboard.
router.post(
  "/:id/reply",
  wrap(async (req, res) => {
    const message = String(req.body.message || "").trim();
    if (!message || !/^[a-f\d]{24}$/i.test(req.params.id))
      return res.status(400).json({ message: "Message required" });
    const t = await SupportTicket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Not found" });
    t.replies.push({
      message,
      from: "gym",
      senderName: req.user.name || "Gym",
    });
    if (t.status !== "open") t.status = "open";
    await t.save();
    res.json({ success: true, data: t });
    pushTicket(t, { message, senderName: req.user.name || t.companyName });
  }),
);

module.exports = router;
