const express = require("express");
const router = express.Router();
const {
  assignTrainer,
  unassignTrainer,
  getTrainerMembers,
  getAssignments,
} = require("../controllers/trainerController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router.get("/", checkPermission("Trainers", "read"), getAssignments);
router.post("/assign", checkPermission("Trainers", "create"), assignTrainer);
router.post(
  "/:id/unassign",
  checkPermission("Trainers", "update"),
  unassignTrainer,
);
router.get(
  "/:trainerId/members",
  checkPermission("Trainers", "read"),
  getTrainerMembers,
);

module.exports = router;
