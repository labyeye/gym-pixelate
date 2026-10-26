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


// The extension and MIME type come from the client, so check the real file signature too.
const SIGNATURES = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  gif: (b) => b.slice(0, 4).toString("latin1") === "GIF8",
  webp: (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP",
  heic: (b) => b.slice(4, 8).toString("latin1") === "ftyp",
  heif: (b) => b.slice(4, 8).toString("latin1") === "ftyp",
  pdf: (b) => b.slice(0, 4).toString("latin1") === "%PDF",
};
const verifySignature = (req, res, next) => {
  if (!req.file) return next();
  let ok = false;
  try {
    const fd = fs.openSync(req.file.path, "r");
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const check = SIGNATURES[path.extname(req.file.filename).slice(1).toLowerCase()];
    ok = !!check && check(head);
  } catch {
    ok = false;
  }
  if (!ok) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: "That file is not a valid photo or PDF" });
  }
  next();
};

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // photos only; phones' camera shots fit well under this
  fileFilter: (req, file, cb) => {
    const ok = /^(jpe?g|png|webp|gif|heic|heif)$/.test(path.extname(file.originalname).slice(1).toLowerCase())
      && /^image\//.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error("Only photos (JPG, PNG, WebP, HEIC) are allowed"));
  },
});

// vendor bills / documents: PDF or photo
const billUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    /^(pdf|jpe?g|png|webp)$/.test(ext) ? cb(null, true) : cb(new Error("Only PDF or photo bills are allowed"));
  },
});
router.post("/bill", protect, (req, res, next) => {
  billUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 8 MB)" : err.message });
    next();
  });
}, verifySignature, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  const base = (process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  res.json({ success: true, url: `${base}/uploads/${req.file.filename}` });
});

router.post("/", protect, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.code === "LIMIT_FILE_SIZE" ? "Photo is too large (max 8 MB)" : err.message });
    next();
  });
}, verifySignature, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  // Public base of THIS server: explicit env wins, otherwise whatever host the app called (trust proxy is on).
  const base = (process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  res.json({ success: true, url: `${base}/uploads/${req.file.filename}` });
});

module.exports = router;
