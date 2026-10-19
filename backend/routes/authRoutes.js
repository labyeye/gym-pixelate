const express = require("express");
const router = express.Router();
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
const { protect } = require("../middleware/auth");
const { otpCountryLimit } = require("../middleware/otpLimit");

router.post("/register", register);
router.post("/login", login);
router.post("/otp/send", otpCountryLimit, sendOtp);
router.post("/otp/verify", verifyOtp);
router.post("/onboarding", protect, saveOnboarding);
router.get("/me", protect, getMe);
router.put("/me", protect, updateProfile);
router.put("/change-password", protect, changePassword);

module.exports = router;
