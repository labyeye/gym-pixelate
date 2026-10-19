const express = require("express");
const router = express.Router();
const multer = require("multer");
const { registerFace, verifyFace } = require("../controllers/faceController");
const { protect } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ok = allowed.test(file.mimetype.split("/")[1]);
    ok ? cb(null, true) : cb(new Error("Only image files are allowed"));
  },
});

router.use(protect);

router.post("/register", upload.single("file"), registerFace);
router.post("/verify", upload.single("file"), verifyFace);

module.exports = router;
