const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getActivityLogs,
  getActivityStats,
} = require("../controllers/activityController");

router.use(protect, authorize("super_admin", "gym_owner", "branch_manager")); // tenant-scoped in the controller

router.get("/", getActivityLogs);
router.get("/stats", getActivityStats);

module.exports = router;
