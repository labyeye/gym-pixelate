const express = require("express");
const router = express.Router();
const {
  getMembers,
  searchMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
} = require("../controllers/memberController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router.get("/search", checkPermission("Members", "read"), searchMembers);

router
  .route("/")
  .get(checkPermission("Members", "read"), getMembers)
  .post(checkPermission("Members", "create"), createMember);

router
  .route("/:id")
  .get(checkPermission("Members", "read"), getMember)
  .put(checkPermission("Members", "update"), updateMember)
  .delete(checkPermission("Members", "delete"), deleteMember);

module.exports = router;
