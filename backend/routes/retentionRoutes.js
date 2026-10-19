const express = require("express");
const router = express.Router();
const c = require("../controllers/retentionController");
const { protect } = require("../middleware/auth");
const { checkPermission: can } = require("../middleware/checkPermission");

router.use(protect);
// Receptionists work the list (Memberships); the funnel numbers are management-only (Reports).
router.get("/opportunities", can("Memberships", "read"), c.opportunities);
router.get("/follow-ups", can("Memberships", "read"), c.listFollowUps);
router.post("/follow-ups", can("Memberships", "update"), c.addFollowUp);
router.get("/conversion", can("Reports", "read"), c.conversion);

module.exports = router;
