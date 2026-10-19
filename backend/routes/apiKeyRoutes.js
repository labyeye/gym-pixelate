const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
} = require("../controllers/apiKeyController");

router.use(protect, authorize("super_admin", "gym_owner"));

router.route("/").get(listApiKeys).post(generateApiKey);
router.delete("/:id", revokeApiKey);

module.exports = router;
