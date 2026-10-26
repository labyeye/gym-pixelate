const express = require("express");
const c = require("../controllers/walletController");
const { protect, authorize } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");
const router = express.Router();

router.use(protect);
router.get("/:memberId", checkPermission("Members", "read"), c.get);
router.post("/:memberId/adjust", authorize("super_admin", "gym_owner", "branch_manager"), c.adjust);
router.post("/:memberId/apply", checkPermission("Invoices", "update"), c.apply);

module.exports = router;
