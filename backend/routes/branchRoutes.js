const express = require("express");
const router = express.Router();
const {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
} = require("../controllers/branchController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router
  .route("/")
  .get(checkPermission("Branches", "read"), getBranches)
  .post(checkPermission("Branches", "create"), createBranch);

router
  .route("/:id")
  .get(checkPermission("Branches", "read"), getBranch)
  .put(checkPermission("Branches", "update"), updateBranch)
  .delete(checkPermission("Branches", "delete"), deleteBranch);

module.exports = router;
