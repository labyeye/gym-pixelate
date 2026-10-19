const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { protect } = require("../middleware/auth");

// Photos are always uploaded to this server (members, trainers, logo, progress shots) —
// nobody pastes image URLs. The folder must exist or every upload fails with ENOENT.
const DIR = path.join(__dirname, "../uploads");
fs.mkdirSync(DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // photos only; phones' camera shots fit well under this
  fileFilter: (req, file, cb) => {
    const ok = /^(jpe?g|png|webp|gif|heic|heif)$/.test(path.extname(file.originalname).slice(1).toLowerCase())
      && /^image\//.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error("Only photos (JPG, PNG, WebP, HEIC) are allowed"));
  },
});

router.post("/", protect, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.code === "LIMIT_FILE_SIZE" ? "Photo is too large (max 8 MB)" : err.message });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  // Public base of THIS server: explicit env wins, otherwise whatever host the app called (trust proxy is on).
  const base = (process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  res.json({ success: true, url: `${base}/uploads/${req.file.filename}` });
});

module.exports = router;
