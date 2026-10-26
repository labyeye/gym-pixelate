const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const User = require("../models/User");
const Session = require("../models/Session");
const logActivity = require("../utils/activityLogger");
const { sendWhatsAppOtp } = require("../utils/whatsappOtp");
const { parsePhone } = require("../utils/phone");
const {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendSecurityAlertEmail,
} = require("../utils/emailService");
const { completeSignIn } = require("../utils/signIn");
const { verifyPendingToken } = require("../utils/generateToken");
const {
  generateOtp,
  hashOtp,
  checkOtp,
  isEmail,
  STRONG_PASSWORD_RE,
  STRONG_PASSWORD_MSG,
} = require("../utils/otpTools");

const TEN_MIN = 10 * 60 * 1000;
const lower = (e) => String(e || "").toLowerCase().trim();
const bad = (res, status, msg) => {
  res.status(status);
  throw new Error(msg);
};

// ── Signed-in devices ────────────────────────────────────────────────────

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id }).sort({ lastActiveAt: -1 });
  res.json({
    success: true,
    data: sessions.map((s) => ({
      _id: s._id,
      deviceName: s.deviceName,
      platform: s.platform,
      ip: s.ip,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      current: String(s._id) === req.sessionId,
    })),
  });
});

const removeSession = asyncHandler(async (req, res) => {
  const gone = await Session.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!gone) bad(res, 404, "Device not found");
  logActivity({
    user: req.user,
    action: "SESSION_REVOKED",
    module: "Auth",
    description: `${req.user.name} signed out ${gone.deviceName}`,
    ip: req.ip,
  });
  res.json({ success: true, message: "Device signed out" });
});

const removeOtherSessions = asyncHandler(async (req, res) => {
  await Session.deleteMany(
    req.sessionId ? { userId: req.user._id, _id: { $ne: req.sessionId } } : { userId: req.user._id },
  );
  res.json({ success: true, message: "Signed out of all other devices" });
});

// ── Password reset finish (shared by every reset method) ─────────────────

function assertNewPassword(res, password) {
  if (typeof password !== "string" || !STRONG_PASSWORD_RE.test(password)) bad(res, 400, STRONG_PASSWORD_MSG);
}

// Saving a new password stamps passwordChangedAt (User pre-save), retiring older tokens; sessions go too.
async function finishPasswordReset(res, user) {
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  await Session.deleteMany({ userId: user._id });
  sendSecurityAlertEmail({ to: user.email, name: user.name, what: "Your NestGym password was just reset." });
  res.json({ success: true, message: "Password reset successful. You can now log in." });
}

// ── Backup codes (recovery codes, single use) ────────────────────────────

const CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const hashCode = (c) =>
  crypto.createHash("sha256").update(String(c).toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
const newCode = () => {
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
};
const mintCodes = (user) => {
  const codes = Array.from({ length: CODE_COUNT }, newCode);
  user.backupCodes = codes.map((c) => ({ hash: hashCode(c) }));
  user.backupCodesGeneratedAt = new Date();
  return codes;
};
const takeBackupCode = (user, code) => {
  const h = hashCode(code);
  const entry = (user.backupCodes || []).find((c) => c.hash === h && !c.usedAt);
  if (entry) entry.usedAt = new Date();
  return !!entry;
};

const backupCodesStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+backupCodes backupCodesGeneratedAt");
  res.json({
    success: true,
    data: {
      remaining: user.backupCodes.filter((c) => !c.usedAt).length,
      generatedAt: user.backupCodesGeneratedAt || null,
    },
  });
});

// Replaces any existing set. Needs the account password so a stolen session alone can't mint recovery codes.
const generateBackupCodes = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (typeof password !== "string" || !(await user.matchPassword(password))) bad(res, 400, "Password is incorrect");
  const codes = mintCodes(user);
  await user.save();
  res.json({ success: true, data: { codes } });
});

const loginWithBackupCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const fail = () => bad(res, 401, "Invalid email or backup code");
  if (!isEmail(email) || typeof code !== "string") return fail();
  const user = await User.findOne({ email: lower(email) }).select("+backupCodes");
  if (!user || user.status === "inactive" || !takeBackupCode(user, code)) return fail();
  await completeSignIn(req, res, user);
});

const resetPasswordWithBackupCode = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;
  assertNewPassword(res, password);
  const fail = () => bad(res, 400, "Invalid email or backup code");
  if (!isEmail(email) || typeof code !== "string") return fail();
  const user = await User.findOne({ email: lower(email) }).select("+backupCodes +password");
  if (!user || !takeBackupCode(user, code)) return fail();
  user.password = password;
  await finishPasswordReset(res, user);
});

// ── Authenticator-app 2FA ────────────────────────────────────────────────

// Accepts the 6-digit authenticator code or a backup code. Ten wrong tries lock 2FA for 30 minutes.
async function checkTwoFactorCode(user, token, res) {
  if (user.twoFactorLockUntil && user.twoFactorLockUntil > new Date()) {
    bad(res, 429, "Too many wrong codes. Try again in a while.");
  }
  const code = String(token || "").trim();
  const isTotp =
    /^\d{6}$/.test(code) &&
    speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: "base32", token: code, window: 1 });
  const isBackup = !isTotp && takeBackupCode(user, code);
  if (!isTotp && !isBackup) {
    user.twoFactorFailedAttempts = (user.twoFactorFailedAttempts || 0) + 1;
    if (user.twoFactorFailedAttempts >= 10) {
      user.twoFactorLockUntil = new Date(Date.now() + 30 * 60 * 1000);
      user.twoFactorFailedAttempts = 0;
    }
    await user.save();
    bad(res, 401, "Invalid authentication code");
  }
  user.twoFactorFailedAttempts = 0;
  user.twoFactorLockUntil = undefined;
}

const setup2FA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.twoFactorEnabled) bad(res, 400, "Two-factor authentication is already on");
  const secret = speakeasy.generateSecret({ name: `NestGym (${user.email})`, length: 32 });
  user.twoFactorSecret = secret.base32;
  await user.save();
  const qr = await QRCode.toDataURL(secret.otpauth_url);
  res.json({ success: true, data: { secret: secret.base32, qr } });
});

const confirm2FA = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) bad(res, 400, "Code is required");
  const user = await User.findById(req.user._id).select("+twoFactorSecret +backupCodes");
  if (!user.twoFactorSecret) bad(res, 400, "Start the setup first");
  if (!speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: "base32", token: String(token).trim(), window: 1 })) {
    bad(res, 400, "Invalid code. Try again.");
  }
  user.twoFactorEnabled = true;
  const codes = mintCodes(user);
  await user.save();
  logActivity({
    user: req.user,
    action: "TWO_FACTOR_ENABLED",
    module: "Auth",
    description: `${user.name} turned on two-factor authentication`,
    ip: req.ip,
  });
  sendSecurityAlertEmail({ to: user.email, name: user.name, what: "Two-factor authentication was turned on for your NestGym account." });
  res.json({ success: true, data: { backupCodes: codes } });
});

const disable2FA = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findById(req.user._id).select("+twoFactorSecret +backupCodes +password");
  if (!user.twoFactorEnabled) bad(res, 400, "Two-factor authentication is not on");
  if (typeof password !== "string" || !(await user.matchPassword(password))) bad(res, 400, "Password is incorrect");
  await checkTwoFactorCode(user, token, res);
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save();
  logActivity({
    user: req.user,
    action: "TWO_FACTOR_DISABLED",
    module: "Auth",
    description: `${user.name} turned off two-factor authentication`,
    ip: req.ip,
  });
  sendSecurityAlertEmail({ to: user.email, name: user.name, what: "Two-factor authentication was turned off for your NestGym account." });
  res.json({ success: true, message: "Two-factor authentication turned off" });
});

// Second step of sign-in: needs the pending token the password step returned.
const verify2FA = asyncHandler(async (req, res) => {
  const { pendingToken, token } = req.body;
  if (!token || typeof token !== "string") bad(res, 400, "A code is required");
  let userId;
  try {
    userId = verifyPendingToken(String(pendingToken || "")).id;
  } catch {
    return bad(res, 401, "Your sign-in session expired. Please sign in again.");
  }
  const user = await User.findById(userId).select("+twoFactorSecret +backupCodes");
  if (!user || !user.twoFactorEnabled || user.status === "inactive") bad(res, 400, "Invalid request");
  await checkTwoFactorCode(user, token, res);
  await completeSignIn(req, res, user);
});

const resetPasswordWithTotp = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;
  if (!isEmail(email) || !token) bad(res, 400, "Email and authenticator code are required");
  assertNewPassword(res, password);
  const user = await User.findOne({ email: lower(email), twoFactorEnabled: true }).select(
    "+twoFactorSecret +backupCodes +password",
  );
  if (!user) bad(res, 400, "Invalid authentication code");
  await checkTwoFactorCode(user, token, res);
  user.password = password;
  await finishPasswordReset(res, user);
});

// ── Forgot password ──────────────────────────────────────────────────────

// Tells the forgot-password screen which reset methods this account has set up.
// Every address gets the same list, so this endpoint cannot be used to find out which emails have an account or
// what protection they use. A method the account has not set up fails later with the same generic message.
const forgotPasswordMethods = asyncHandler(async (req, res) => {
  const { email } = req.query;
  if (!isEmail(email)) bad(res, 400, "Please provide a valid email address");
  res.json({ success: true, data: { methods: ["email", "whatsapp", "totp", "backup", "passkey"] } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!isEmail(email)) bad(res, 400, "Please provide a valid email address");
  const user = await User.findOne({ email: lower(email) });
  if (user && user.status !== "inactive") {
    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const base = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:8081").replace(/\/$/, "");
    try {
      await sendPasswordResetEmail({ toEmail: user.email, toName: user.name, resetUrl: `${base}/reset-password/${token}` });
    } catch {
      /* same answer either way, so delivery failures can't be probed */
    }
  }
  res.json({ success: true, message: "If that email exists, a reset link has been sent." });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  assertNewPassword(res, req.body.password);
  const hashed = crypto.createHash("sha256").update(String(token)).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpire: { $gt: new Date() },
  }).select("+resetPasswordToken +resetPasswordExpire +password");
  if (!user) bad(res, 400, "Invalid or expired reset link");
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await finishPasswordReset(res, user);
});

const forgotPasswordWhatsapp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!isEmail(email)) bad(res, 400, "Please provide a valid email address");
  const user = await User.findOne({ email: lower(email) });
  const parsed = user?.phone ? parsePhone(user.phone) : null;
  if (user?.phoneVerified && parsed && user.status !== "inactive") {
    const otp = generateOtp();
    user.resetOtp = hashOtp(otp);
    user.resetOtpTries = 0;
    user.resetOtpExpire = new Date(Date.now() + TEN_MIN);
    await user.save();
    try {
      await sendWhatsAppOtp(parsed.e164, otp);
    } catch {
      /* same answer either way */
    }
  }
  res.json({ success: true, message: "If that account has WhatsApp reset enabled, a code was sent." });
});

const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!isEmail(email) || !otp) bad(res, 400, "Email and code are required");
  assertNewPassword(res, password);
  const user = await User.findOne({ email: lower(email) }).select(
    "+resetOtp +resetOtpExpire +resetOtpTries +password",
  );
  if (!user || !(await checkOtp(user, String(otp), { hashField: "resetOtp", expireField: "resetOtpExpire", triesField: "resetOtpTries" }))) {
    bad(res, 400, "This code is invalid or has expired");
  }
  user.password = password;
  user.resetOtp = undefined;
  user.resetOtpExpire = undefined;
  user.resetOtpTries = 0;
  await finishPasswordReset(res, user);
});

// ── Email OTP sign-in ────────────────────────────────────────────────────

const loginRequestEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!isEmail(email)) bad(res, 400, "Please provide a valid email address");
  const user = await User.findOne({ email: lower(email) });
  if (user && user.status !== "inactive") {
    const otp = generateOtp();
    user.emailLoginOtp = hashOtp(otp);
    user.emailLoginOtpTries = 0;
    user.emailLoginOtpExpire = new Date(Date.now() + TEN_MIN);
    await user.save();
    try {
      await sendOtpEmail({ to: user.email, name: user.name, otp, purpose: "login" });
    } catch {
      /* same response either way so it can't be probed */
    }
  }
  res.json({ success: true, message: "If that email is registered, a code has been sent to it." });
});

const loginVerifyEmailOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const fail = () => bad(res, 401, "Invalid or expired code");
  if (!isEmail(email) || !otp) return fail();
  const user = await User.findOne({ email: lower(email) }).select(
    "+emailLoginOtp +emailLoginOtpExpire +emailLoginOtpTries",
  );
  if (
    !user ||
    user.status === "inactive" ||
    !(await checkOtp(user, String(otp), { hashField: "emailLoginOtp", expireField: "emailLoginOtpExpire", triesField: "emailLoginOtpTries" }))
  ) {
    return fail();
  }
  user.emailLoginOtp = undefined;
  user.emailLoginOtpExpire = undefined;
  user.emailLoginOtpTries = 0;
  await completeSignIn(req, res, user);
});

// ── Email verification / change (code goes to the address being verified) ─

const sendEmailVerifyOtp = asyncHandler(async (req, res) => {
  const email = lower(req.body.email);
  if (!isEmail(email)) bad(res, 400, "Enter a valid email address");
  const user = await User.findById(req.user._id);
  if (email === user.email && user.emailVerified) bad(res, 400, "This email is already verified");
  if (email !== user.email && (await User.findOne({ email, _id: { $ne: user._id } }))) {
    bad(res, 400, "This email is already in use");
  }
  const otp = generateOtp();
  user.pendingEmail = email;
  user.contactOtp = hashOtp(otp);
  user.contactOtpTries = 0;
  user.contactOtpExpire = new Date(Date.now() + TEN_MIN);
  await user.save();
  try {
    await sendOtpEmail({ to: email, name: user.name, otp, purpose: "verify-email" });
  } catch {
    bad(res, 502, "We could not send the email right now. Please try again later.");
  }
  res.json({ success: true, message: "Code sent to the email" });
});

const verifyEmailVerifyOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+pendingEmail +contactOtp +contactOtpExpire +contactOtpTries");
  if (
    !user ||
    !user.pendingEmail ||
    !(await checkOtp(user, String(req.body.otp || ""), { hashField: "contactOtp", expireField: "contactOtpExpire", triesField: "contactOtpTries" }))
  ) {
    bad(res, 400, "This code is invalid or has expired");
  }
  const email = user.pendingEmail;
  if (email !== user.email && (await User.findOne({ email, _id: { $ne: user._id } }))) {
    bad(res, 400, "This email is already in use");
  }
  const old = user.email;
  user.email = email;
  user.emailVerified = true;
  user.pendingEmail = undefined;
  user.contactOtp = undefined;
  user.contactOtpExpire = undefined;
  user.contactOtpTries = 0;
  await user.save();
  if (old !== email) sendSecurityAlertEmail({ to: old, name: user.name, what: `The email on your NestGym account was changed to ${email}.` });
  res.json({ success: true, message: "Email verified", data: { email: user.email, emailVerified: true } });
});

// ── Phone verification (WhatsApp code; unlocks WhatsApp password reset) ──

const sendPhoneVerifyOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const parsed = user.phone ? parsePhone(user.phone) : null;
  if (!parsed) bad(res, 400, "Add a valid phone number to your profile first");
  const otp = generateOtp();
  user.phoneVerifyOtp = hashOtp(otp);
  user.phoneVerifyOtpTries = 0;
  user.phoneVerifyOtpExpire = new Date(Date.now() + TEN_MIN);
  await user.save();
  try {
    await sendWhatsAppOtp(parsed.e164, otp);
  } catch {
    bad(res, 502, "We could not send the WhatsApp code right now. Please try again later.");
  }
  res.json({ success: true, message: "Code sent via WhatsApp" });
});

const verifyPhoneVerifyOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+phoneVerifyOtp +phoneVerifyOtpExpire +phoneVerifyOtpTries");
  if (
    !user ||
    !(await checkOtp(user, String(req.body.otp || ""), { hashField: "phoneVerifyOtp", expireField: "phoneVerifyOtpExpire", triesField: "phoneVerifyOtpTries" }))
  ) {
    bad(res, 400, "This code is invalid or has expired");
  }
  user.phoneVerified = true;
  user.phoneVerifyOtp = undefined;
  user.phoneVerifyOtpExpire = undefined;
  await user.save();
  res.json({ success: true, message: "Phone number verified", data: { phoneVerified: true } });
});

module.exports = {
  assertNewPassword,
  finishPasswordReset,
  listSessions,
  removeSession,
  removeOtherSessions,
  backupCodesStatus,
  generateBackupCodes,
  loginWithBackupCode,
  resetPasswordWithBackupCode,
  setup2FA,
  confirm2FA,
  disable2FA,
  verify2FA,
  resetPasswordWithTotp,
  forgotPasswordMethods,
  forgotPassword,
  resetPassword,
  forgotPasswordWhatsapp,
  resetPasswordWithOtp,
  loginRequestEmailOtp,
  loginVerifyEmailOtp,
  sendEmailVerifyOtp,
  verifyEmailVerifyOtp,
  sendPhoneVerifyOtp,
  verifyPhoneVerifyOtp,
};
