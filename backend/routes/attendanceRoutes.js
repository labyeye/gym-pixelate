const express = require("express");
const router = express.Router();
const c = require("../controllers/attendanceController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router.get("/", checkPermission("Attendance", "read"), c.getAttendance);
router.get("/live", checkPermission("Attendance", "read"), c.liveStatus);
router.post(
  "/access-check",
  checkPermission("Attendance", "read"),
  c.checkAccess,
);
router.post("/checkin", checkPermission("Attendance", "create"), c.checkin);
router.post("/checkout", checkPermission("Attendance", "update"), c.checkout);

module.exports = router;
