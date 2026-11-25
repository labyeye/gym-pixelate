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
// An image for an ID-card design (background, logo, badge...). Public like the logo; the design itself is saved through
// PUT /settings, whose validator only accepts URLs from this folder.
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const IMG_DIR = path.join(__dirname, "../uploads/id-card-images");
fs.mkdirSync(IMG_DIR, { recursive: true });
const MAGIC = {
  ".png": (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  ".jpg": (b) => b[0] === 0xff && b[1] === 0xd8,
  ".jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  ".webp": (b) => b.slice(8, 12).toString("latin1") === "WEBP",
};
const idImage = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, IMG_DIR),
    filename: (_r, f, cb) =>
      cb(
        null,
        `idc_${crypto.randomUUID()}${path.extname(f.originalname).toLowerCase()}`,
      ),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, f, cb) =>
    MAGIC[path.extname(f.originalname).toLowerCase()]
      ? cb(null, true)
      : cb(new Error("Only PNG, JPG or WebP images are allowed")),
}).single("image");
router.post(
  "/id-card-image",
  authorize("super_admin", "gym_owner"),
  (req, res, next) =>
    idImage(req, res, (err) =>
      err ? res.status(400).json({ success: false, message: err.message }) : next(),
    ),
  (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded" });
    const head = Buffer.alloc(16);
    const fd = fs.openSync(req.file.path, "r");
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    if (!MAGIC[path.extname(req.file.filename)](head)) {
      fs.unlink(req.file.path, () => {});
      return res
        .status(400)
        .json({ success: false, message: "That file is not a valid image" });
    }
    res.json({ success: true, url: `/uploads/id-card-images/${req.file.filename}` });
  },
);

module.exports = router;
