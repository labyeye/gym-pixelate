const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  register,
  saveOnboarding,
  login,
  sendOtp,
  verifyOtp,
  getMe,
  updateProfile,
  changePassword,
} = require("../controllers/authController");
const sec = require("../controllers/securityController");
const pk = require("../controllers/passkeyController");
const captcha = require("../middleware/captcha");
const { protect } = require("../middleware/auth");
const { otpCountryLimit } = require("../middleware/otpLimit");
const router = express.Router();

// Each call makes a separate limiter, so routes don't share one counter (sending a code and then
// verifying it must not burn the same budget). Signed-in routes are counted per user, public ones per IP.
const limiter = (max = 5, countOnlyFailures = false) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    skipSuccessfulRequests: countOnlyFailures, // a good login does not use up the budget
    message: { success: false, message: "Too many attempts, please wait a few minutes and try again." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `u:${req.user._id}` : req.ip),
  });

router.post("/register", limiter(10), captcha, register);
router.post("/login", limiter(20, true), login);
router.post("/refresh", limiter(60), require("../utils/signIn").refresh);
router.post("/otp/send", limiter(5), captcha, otpCountryLimit, sendOtp);
router.post("/otp/verify", limiter(10), verifyOtp);
router.post("/onboarding", protect, saveOnboarding);
router.get("/me", protect, getMe);
router.put("/me", protect, updateProfile);
router.put("/change-password", protect, limiter(10), changePassword);

// forgot / reset password (every method ends in a strong-password check)
router.get("/forgot-password/methods", limiter(10), sec.forgotPasswordMethods);
router.post("/forgot-password", limiter(5), captcha, sec.forgotPassword);
router.post("/forgot-password/whatsapp", limiter(5), captcha, sec.forgotPasswordWhatsapp);
router.post("/reset-password/otp", limiter(5), sec.resetPasswordWithOtp);
router.post("/reset-password/otp/totp", limiter(5), sec.resetPasswordWithTotp);
router.post("/reset/backup", limiter(10), sec.resetPasswordWithBackupCode);
// keep the :token route last: "otp" must not be read as a token
router.post("/reset-password/:token", limiter(5), sec.resetPassword);

// two-factor (authenticator app) + recovery codes
router.post("/2fa/setup", protect, limiter(10), sec.setup2FA);
router.post("/2fa/confirm", protect, limiter(10), sec.confirm2FA);
router.post("/2fa/disable", protect, limiter(5), sec.disable2FA);
router.post("/2fa/verify", limiter(10), sec.verify2FA);
router.get("/backup-codes", protect, sec.backupCodesStatus);
router.post("/backup-codes", protect, limiter(5), sec.generateBackupCodes);
router.post("/login/backup", limiter(10), sec.loginWithBackupCode);

// email OTP sign-in, email + phone verification
router.post("/login/email-otp/send", limiter(5), captcha, sec.loginRequestEmailOtp);
router.post("/login/email-otp/verify", limiter(10), sec.loginVerifyEmailOtp);
router.post("/contact/email/send-otp", protect, limiter(5), sec.sendEmailVerifyOtp);
router.post("/contact/email/verify-otp", protect, limiter(10), sec.verifyEmailVerifyOtp);
router.post("/phone/send-otp", protect, limiter(5), sec.sendPhoneVerifyOtp);
router.post("/phone/verify-otp", protect, limiter(10), sec.verifyPhoneVerifyOtp);

// signed-in devices
router.get("/sessions", protect, sec.listSessions);
router.delete("/sessions/others", protect, sec.removeOtherSessions);
router.delete("/sessions/:id", protect, sec.removeSession);

// ── Passkeys ────────────────────────────────────────────────────────────
router.post("/passkey/register-options", protect, pk.registerOptions);
router.post("/passkey/register", protect, pk.registerVerify);
router.get("/passkey", protect, pk.listPasskeys);
router.delete("/passkey/:id", protect, pk.deletePasskey);
router.get("/passkey/login-options", limiter(10), pk.loginOptions);
router.post("/passkey/login", limiter(10), pk.loginVerify);
router.get("/reset/passkey-options", limiter(5), pk.resetOptions);
router.post("/reset/passkey", limiter(10), pk.resetVerify);

module.exports = router;
