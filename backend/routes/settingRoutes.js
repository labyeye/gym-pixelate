const express = require("express");
const router = express.Router();
const {
  getSettings,
  updateSettings,
} = require("../controllers/settingController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router
  .route("/")
  .get(getSettings)
  .put(authorize("super_admin", "gym_owner"), updateSettings);
module.exports = router;
