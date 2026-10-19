const express = require("express");
const router = express.Router();
const {
  getPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/membershipPlanController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router
  .route("/")
  .get(checkPermission("MembershipPlans", "read"), getPlans)
  .post(checkPermission("MembershipPlans", "create"), createPlan);

router
  .route("/:id")
  .get(checkPermission("MembershipPlans", "read"), getPlan)
  .put(checkPermission("MembershipPlans", "update"), updatePlan)
  .delete(checkPermission("MembershipPlans", "delete"), deletePlan);

module.exports = router;
