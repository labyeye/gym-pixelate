const express = require("express");
const asyncHandler = require("express-async-handler");
const Mandate = require("../models/Mandate");
const autopay = require("../utils/autopay");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");
const router = express.Router();

router.use(protect);

router.get("/", checkPermission("Memberships", "read"), asyncHandler(async (req, res) => {
  const q = req.query.memberId ? { memberId: req.query.memberId } : {};
  res.json({ success: true, data: await Mandate.find(q).sort("-createdAt").limit(200) });
}));
router.post("/memberships/:id", checkPermission("Memberships", "update"), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await autopay.enable(req.user.tenantId, req.params.id, req.user._id) });
}));
router.post("/:id/cancel", checkPermission("Memberships", "update"), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await autopay.cancel(req.user.tenantId, req.params.id) });
}));

module.exports = router;
