const express = require("express");
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router
  .route("/")
  .get(authorize("super_admin", "gym_owner", "branch_manager"), getUsers)
  .post(authorize("super_admin", "gym_owner", "branch_manager"), createUser);

router
  .route("/:id")
  .get(authorize("super_admin", "gym_owner", "branch_manager"), getUser)
  .put(authorize("super_admin", "gym_owner", "branch_manager"), updateUser)
  .delete(authorize("super_admin", "gym_owner"), deleteUser);

module.exports = router;
