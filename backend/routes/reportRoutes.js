const express = require("express");
const router = express.Router();
const c = require("../controllers/reportController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);
const read = checkPermission("Reports", "read");

router.get("/overview", read, c.overview);
router.get("/dues", read, c.dues);
router.get("/renewals", read, c.renewals);
router.get("/birthdays", read, c.birthdays);
router.get("/gst", read, c.gstRegister);
router.get("/insights", read, c.insights);

module.exports = router;
