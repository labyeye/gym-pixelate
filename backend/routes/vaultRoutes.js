const express = require("express");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const User = require("../models/User");
const VaultDocument = require("../models/VaultDocument");
const Member = require("../models/Member");
const { protect, authorize } = require("../middleware/auth");
const { generateOtp, hashOtp, checkOtp } = require("../utils/otpTools");
const { sendWhatsAppOtp } = require("../utils/whatsappOtp");
const { sendOtpEmail } = require("../utils/emailService");
const { parsePhone } = require("../utils/phone");

const router = express.Router();
const ROOT = path.join(__dirname, "../vault");
const TEN_MIN = 10 * 60 * 1000;
const secret = () =>
  process.env.FIELD_ENCRYPTION_KEY ||
  process.env.ENCRYPTION_SECRET ||
  process.env.JWT_SECRET;
const fileKey = () =>
  crypto
    .createHash("sha256")
    .update("nestgym-vault-v1|" + secret())
    .digest();
const fail = (res, code, message) =>
  res.status(code).json({ success: false, message });

// stored: iv(12) | tag(16) | ciphertext
const seal = (buf) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", fileKey(), iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
};
const open = (buf) => {
  const d = crypto.createDecipheriv(
    "aes-256-gcm",
    fileKey(),
    buf.subarray(0, 12),
  );
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
};

const TYPES = {
  pdf: [
    "application/pdf",
    (b) => b.subarray(0, 4).toString("latin1") === "%PDF",
  ],
  jpg: ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  jpeg: ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  png: [
    "image/png",
    (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  ],
  webp: [
    "image/webp",
    (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  ],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(protect, authorize("super_admin", "gym_owner", "branch_manager"));

// 1) ask for a code (WhatsApp if the owner's number is verified, otherwise email)
router.post(
  "/otp",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select(
      "+vaultOtp +vaultOtpExpire +vaultOtpTries",
    );
    if (
      user.vaultOtpExpire &&
      user.vaultOtpExpire - Date.now() > TEN_MIN - 30000
    )
      return fail(res, 429, "Code already sent. Wait 30 seconds to resend.");
    const otp = generateOtp();
    user.vaultOtp = hashOtp(otp);
    user.vaultOtpTries = 0;
    user.vaultOtpExpire = new Date(Date.now() + TEN_MIN);
    await user.save({ validateBeforeSave: false });
    const parsed =
      user.phoneVerified && user.phone ? parsePhone(user.phone) : null;
    let via = "email";
    try {
      if (parsed) {
        await sendWhatsAppOtp(parsed.e164, otp);
        via = "whatsapp";
      } else
        await sendOtpEmail({
          to: user.email,
          name: user.name,
          otp,
          purpose: "login",
        });
    } catch {
      return fail(res, 502, "Could not send the code. Try again.");
    }
    res.json({ success: true, via, message: `Code sent by ${via}` });
  }),
);

// 2) swap the code for a 10-minute vault pass
router.post(
  "/unlock",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select(
      "+vaultOtp +vaultOtpExpire +vaultOtpTries",
    );
    if (
      !(await checkOtp(user, String(req.body.otp || ""), {
        hashField: "vaultOtp",
        expireField: "vaultOtpExpire",
        triesField: "vaultOtpTries",
      }))
    )
      return fail(res, 400, "Wrong or expired code");
    user.vaultOtp = undefined;
    user.vaultOtpExpire = undefined;
    user.vaultOtpTries = 0;
    await user.save({ validateBeforeSave: false });
    const pass = jwt.sign(
      { uid: String(req.user._id), v: 1 },
      process.env.JWT_SECRET + ":vault",
      { expiresIn: "10m" },
    );
    res.json({ success: true, pass, expiresIn: 600 });
  }),
);

// everything below needs the pass (header X-Vault-Pass)
router.use((req, res, next) => {
  try {
    const p = jwt.verify(
      String(req.get("x-vault-pass") || ""),
      process.env.JWT_SECRET + ":vault",
    );
    if (p.uid === String(req.user._id)) return next();
  } catch {}
  fail(res, 423, "Vault is locked. Enter the code sent to you.");
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = {};
    if (req.query.category) q.category = String(req.query.category);
    if (req.query.memberId) q.memberId = String(req.query.memberId);
    if (req.query.userId) q.userId = String(req.query.userId);
    const data = await VaultDocument.find(q)
      .sort("-createdAt")
      .limit(500)
      .populate("memberId", "name memberCode")
      .populate("userId", "name role")
      .select("-file")
      .lean();
    res.json({ success: true, data });
  }),
);

router.post(
  "/",
  (req, res, next) =>
    upload.single("file")(req, res, (e) =>
      e
        ? fail(
            res,
            400,
            e.code === "LIMIT_FILE_SIZE"
              ? "File too large (max 10 MB)"
              : e.message,
          )
        : next(),
    ),
  asyncHandler(async (req, res) => {
    const f = req.file;
    if (!f) return fail(res, 400, "No file uploaded");
    const t = TYPES[path.extname(f.originalname).slice(1).toLowerCase()];
    if (!t || !t[1](f.buffer))
      return fail(res, 400, "Only PDF, JPG, PNG or WebP files are allowed");
    // the owner of the document must belong to this gym (tenant scope filters both lookups)
    const { memberId, userId } = req.body;
    if (memberId && userId)
      return fail(
        res,
        400,
        "Pick either a member or a staff/trainer, not both",
      );
    if (memberId && !(await Member.exists({ _id: memberId })))
      return fail(res, 400, "Member not found");
    if (
      userId &&
      !(await User.exists({ _id: userId, tenantId: req.user.tenantId }))
    )
      return fail(res, 400, "Staff member not found");
    const tenant = String(req.user.tenantId || "global");
    fs.mkdirSync(path.join(ROOT, tenant), { recursive: true });
    const file = crypto.randomBytes(16).toString("hex") + ".enc";
    fs.writeFileSync(path.join(ROOT, tenant, file), seal(f.buffer));
    const doc = await VaultDocument.create({
      tenantId: req.user.tenantId,
      memberId: memberId || undefined,
      userId: userId || undefined,
      title: String(req.body.title || f.originalname).slice(0, 120),
      category: req.body.category || "other",
      file,
      originalName: f.originalname,
      mime: t[0],
      size: f.size,
      uploadedBy: req.user._id,
    });
    res
      .status(201)
      .json({ success: true, data: { ...doc.toObject(), file: undefined } });
  }),
);

router.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const d = await VaultDocument.findById(req.params.id);
    if (!d) return fail(res, 404, "Not found");
    let plain;
    try {
      plain = open(
        fs.readFileSync(
          path.join(ROOT, String(d.tenantId || "global"), d.file),
        ),
      );
    } catch {
      return fail(res, 410, "File is missing or damaged");
    }
    res.set({
      "Content-Type": d.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(d.originalName || "document")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(plain);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = await VaultDocument.findByIdAndDelete(req.params.id);
    if (!d) return fail(res, 404, "Not found");
    fs.unlink(
      path.join(ROOT, String(d.tenantId || "global"), d.file),
      () => {},
    );
    res.json({ success: true });
  }),
);

module.exports = router;
module.exports._crypto = { seal, open };
