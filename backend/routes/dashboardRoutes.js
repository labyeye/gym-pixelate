const express = require("express");
const router = express.Router();
const {
  getDashboardSummary,
  getDashboardCharts,
} = require("../controllers/reportController");
const { protect } = require("../middleware/auth");

router.get("/summary", protect, getDashboardSummary);
router.get("/charts", protect, getDashboardCharts);

module.exports = router;
