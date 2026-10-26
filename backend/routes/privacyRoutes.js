const express = require("express");
const c = require("../controllers/privacyController");
const { protect, authorize } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");
const router = express.Router();

router.use(protect);
const owner = authorize("super_admin", "gym_owner");

router.get("/waiver", checkPermission("Members", "read"), c.getWaiver);
router.put("/waiver", owner, c.saveWaiver);
router.get("/members/:id/waivers", checkPermission("Members", "read"), c.memberWaivers);
router.post("/members/:id/waivers", checkPermission("Members", "update"), c.signWaiver);
router.get("/members/:id/consents", checkPermission("Members", "read"), c.listConsents);
router.post("/members/:id/consents", checkPermission("Members", "update"), c.addConsent);
router.get("/members/:id/export", owner, c.exportMember);
router.post("/members/:id/erase", owner, c.eraseMember);

module.exports = router;
