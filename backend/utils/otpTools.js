const crypto = require("crypto");
const validator = require("validator");

const MAX_OTP_TRIES = 5;
const { checkPasswordRules } = require("./passwordPolicy");
const STRONG_PASSWORD_RE = { test: (p) => !checkPasswordRules(p) };
const STRONG_PASSWORD_MSG =
  "Password needs 8+ characters with an uppercase, a lowercase, a number and a special character, no simple series like 1234 and nothing common like \"password\".";

const generateOtp = () => String(crypto.randomInt(100000, 1000000));
// Keyed hash: a leaked database can't be turned back into the 6-digit codes with a rainbow table.
const hashOtp = (otp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(otp).trim()).digest("hex");
const otpMatches = (stored, otp) => {
  const a = Buffer.from(String(stored || ""), "hex");
  const b = Buffer.from(hashOtp(otp), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Compares `otp` with the code stored on `user`, counting wrong tries in user[triesField]; after MAX_OTP_TRIES
// misses the code is burned and a new one must be requested. Resolves true only for a live, matching code.
async function checkOtp(user, otp, { hashField, expireField, triesField }) {
  const live =
    user[hashField] && user[expireField] && user[expireField] > new Date() && (user[triesField] || 0) < MAX_OTP_TRIES;
  if (!live) return false;
  if (otpMatches(user[hashField], otp)) return true;
  user[triesField] = (user[triesField] || 0) + 1;
  if (user[triesField] >= MAX_OTP_TRIES) {
    user[hashField] = undefined;
    user[expireField] = undefined;
    user[triesField] = 0;
  }
  await user.save({ validateBeforeSave: false });
  return false;
}

const isEmail = (e) => typeof e === "string" && validator.isEmail(e);

module.exports = {
  MAX_OTP_TRIES,
  STRONG_PASSWORD_RE,
  STRONG_PASSWORD_MSG,
  generateOtp,
  hashOtp,
  checkOtp,
  isEmail,
};
