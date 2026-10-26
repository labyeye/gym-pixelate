const express = require("express");
const asyncHandler = require("express-async-handler");
const NotificationLog = require("../models/NotificationLog");
const { protect, authorize } = require("../middleware/auth");
const router = express.Router();

router.get("/log", protect, authorize("super_admin", "gym_owner", "branch_manager"), asyncHandler(async (req, res) => {
  const rows = await NotificationLog.find({}).sort("-createdAt").limit(100).populate("memberId", "name memberCode").lean();
  res.json({ success: true, data: rows });
}));

module.exports = router;
