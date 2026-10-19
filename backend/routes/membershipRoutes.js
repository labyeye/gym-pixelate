const express = require("express");
const router = express.Router();
const c = require("../controllers/membershipController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router
  .route("/")
  .get(checkPermission("Memberships", "read"), c.getMemberships)
  .post(checkPermission("Memberships", "create"), c.createMembership);

router.post("/sweep", checkPermission("Memberships", "update"), c.runSweepNow);

router
  .route("/:id")
  .get(checkPermission("Memberships", "read"), c.getMembership)
  .put(checkPermission("Memberships", "update"), c.updateMembership)
  .delete(checkPermission("Memberships", "delete"), c.deleteMembership);

router.post(
  "/:id/freeze",
  checkPermission("Memberships", "update"),
  c.freezeMembership,
);
router.post(
  "/:id/unfreeze",
  checkPermission("Memberships", "update"),
  c.unfreezeMembership,
);
router.post(
  "/:id/renew",
  checkPermission("Memberships", "update"),
  c.renewMembership,
);
router.post(
  "/:id/upgrade",
  checkPermission("Memberships", "update"),
  c.upgradeMembership,
);
router.post(
  "/:id/transfer",
  checkPermission("Memberships", "update"),
  c.transferMembership,
);
router.post(
  "/:id/cancel",
  checkPermission("Memberships", "delete"),
  c.cancelMembership,
);

module.exports = router;
