const express = require("express");
const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const MembershipPlan = require("../models/MembershipPlan");
const Product = require("../models/Product");
const { protect, authorize } = require("../middleware/auth");
const router = express.Router();

// Soft-deleted members, plans and products, with a restore button for the owner.
const KINDS = { members: [Member, "name memberCode"], plans: [MembershipPlan, "name price"], products: [Product, "name sku"] };

router.use(protect, authorize("super_admin", "gym_owner", "branch_manager"));

router.get("/", asyncHandler(async (req, res) => {
  const out = {};
  for (const [k, [Model, fields]] of Object.entries(KINDS))
    out[k] = await Model.find({ deletedAt: { $ne: null } }).select(`${fields} deletedAt`).sort("-deletedAt").limit(100).lean();
  res.json({ success: true, data: out });
}));

router.post("/:kind/:id/restore", asyncHandler(async (req, res) => {
  const k = KINDS[req.params.kind];
  if (!k) return res.status(404).json({ success: false, message: "Unknown kind" });
  const r = await k[0].updateOne({ _id: req.params.id, deletedAt: { $ne: null } }, { deletedAt: null });
  if (!r.matchedCount) return res.status(404).json({ success: false, message: "Nothing to restore" });
  res.json({ success: true });
}));

module.exports = router;
