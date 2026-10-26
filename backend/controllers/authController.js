const asyncHandler = require("express-async-handler");
const validator = require("validator");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const generateToken = require("../utils/generateToken");
const { generatePendingToken } = generateToken;
const { issueRefresh, startSession, signInPayload, completeSignIn } = require("../utils/signIn");
const Session = require("../models/Session");
const { STRONG_PASSWORD_RE, STRONG_PASSWORD_MSG } = require("../utils/otpTools");
const { sendSecurityAlertEmail } = require("../utils/emailService");
const logActivity = require("../utils/activityLogger");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendWhatsAppOtp } = require("../utils/whatsappOtp");

// 3 wrong passwords are allowed; the 4th wrong one locks the account for 30 min.
// A WhatsApp OTP login (verifyOtp) lifts the lock.
const MAX_LOGIN_FAILS = 4;
const LOGIN_LOCK_MS = 30 * 60 * 1000;
const LOCKED_MSG =
  "Account locked for 30 minutes after too many wrong passwords. Unlock it now with a WhatsApp OTP.";
const MAX_OTP_TRIES = 5;
// Equalises timing between "no such user" and "wrong password".
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
const otpHash = (otp) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`otp:${otp}`)
    .digest("hex");
const { phoneVariants, parsePhone } = require("../utils/phone");

const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, department } = req.body;
  // The gym name is collected in the onboarding wizard; until then use a placeholder.
  const companyName =
    (req.body.companyName || "").trim() || `${String(name || "").trim()}'s Gym`;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email and password are required");
  }

  const normalizedEmail =
    validator.normalizeEmail(email) || email.toLowerCase().trim();

  if (!validator.isEmail(normalizedEmail)) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }

  if (!STRONG_PASSWORD_RE.test(password)) {
    res.status(400);
    throw new Error(STRONG_PASSWORD_MSG);
  }

  if (name.trim().length < 2 || name.trim().length > 80) {
    res.status(400);
    throw new Error("Name must be between 2 and 80 characters");
  }

  if (companyName.trim().length < 2 || companyName.trim().length > 120) {
    res.status(400);
    throw new Error("Company name must be between 2 and 120 characters");
  }

  const userExists = await User.findOne({ email: normalizedEmail });
  if (userExists) {
    res.status(400);
    throw new Error("An account with that email already exists");
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
    role: "gym_owner",
    phone: phone?.trim(),
    department: department?.trim(),
  });

  const baseSlug = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `${baseSlug}-${user._id.toString().slice(-6)}`;

  const tenant = await Tenant.create({
    name: companyName.trim(),
    slug,
    ownerUser: user._id,
    plan: "trial",
    onboarded: false,
    phone: phone?.trim() || "",
    email: normalizedEmail,
  });

  user.tenantId = tenant._id;
  await user.save({ validateBeforeSave: false });

  logActivity({
    user,
    action: "REGISTER",
    module: "User",
    description: `New account registered: ${user.name} (${tenant.name})`,
    targetId: user._id,
    ip: req.ip,
  });

  const { status, body } = await signInPayload(req, user, 201, res);
  res.status(status).json(body);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Please provide email and password");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password",
  );

  if (!user) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    logActivity({
      user: null,
      action: "LOGIN_FAILED",
      module: "Auth",
      description: "Failed login attempt",
      ip: req.ip,
    });
    res.status(401);
    throw new Error("Invalid email or password");
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    res.status(429);
    throw new Error(LOCKED_MSG);
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    const locked = (user.failedLogins || 0) + 1 >= MAX_LOGIN_FAILS;
    await User.updateOne(
      { _id: user._id },
      locked
        ? {
            $set: {
              failedLogins: 0,
              lockUntil: new Date(Date.now() + LOGIN_LOCK_MS),
            },
          }
        : { $inc: { failedLogins: 1 } },
    );
    logActivity({
      user,
      action: "LOGIN_FAILED",
      module: "Auth",
      description: `Wrong password attempt by ${user.name}`,
      ip: req.ip,
    });
    res.status(locked ? 429 : 401);
    throw new Error(locked ? LOCKED_MSG : "Invalid email or password");
  }

  // Checked only after the password is right, so the status isn't disclosed to someone guessing emails.
  if (user.status === "inactive") {
    res.status(403);
    throw new Error("Account is deactivated. Contact your administrator.");
  }

  if (user.twoFactorEnabled) {
    // The code step must present this token, so 2FA can't be attempted without first knowing the password.
    user.failedLogins = 0;
    user.lockUntil = undefined;
    await user.save({ validateBeforeSave: false });
    return res.json({
      success: true,
      data: { requires2FA: true, pendingToken: generatePendingToken(user._id) },
    });
  }
  await completeSignIn(req, res, user);
});

// WhatsApp OTP login - step 1: send a code to the account's phone.
const sendOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const parsed = req.phone || parsePhone(phone); // req.phone is set by otpCountryLimit
  if (typeof phone !== "string" || !parsed) {
    res.status(400);
    throw new Error("Enter a valid phone number with country code");
  }
  const users = await User.find({
    phone: { $in: phoneVariants(phone) },
    status: { $ne: "inactive" },
  });
  // Several accounts on one number can't be told apart by the code alone.
  if (users.length === 1) {
    const otp = String(crypto.randomInt(100000, 1000000));
    await User.updateOne(
      { _id: users[0]._id },
      {
        $set: {
          loginOtpHash: otpHash(otp),
          loginOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
          loginOtpTries: 0,
        },
      },
    );
    try {
      await sendWhatsAppOtp(parsed.e164, otp);
    } catch (err) {
      console.error("Login OTP send failed:", err.message);
    }
  }
  // Same answer whether or not the number is registered.
  res.json({
    success: true,
    message: "If that number is registered, an OTP has been sent.",
  });
});

// Checks a WhatsApp OTP (single use, 5 tries) and returns the user with the OTP fields cleared and any
// password lock lifted; the caller saves the user. Shared by OTP login and password reset.
const consumeOtp = async (res, phone, otp) => {
  const user = await User.findOne({
    phone: { $in: phoneVariants(phone) },
    status: { $ne: "inactive" },
    loginOtpExpires: { $gt: new Date() },
    loginOtpHash: { $exists: true },
  }).select("+loginOtpHash +loginOtpTries");
  const given = Buffer.from(otpHash(otp.trim()));
  const stored = user ? Buffer.from(user.loginOtpHash) : null;
  if (
    !stored ||
    stored.length !== given.length ||
    !crypto.timingSafeEqual(stored, given)
  ) {
    if (user) {
      const burnt = (user.loginOtpTries || 0) + 1 >= MAX_OTP_TRIES;
      await User.updateOne(
        { _id: user._id },
        burnt
          ? { $unset: { loginOtpHash: 1, loginOtpExpires: 1 } }
          : { $inc: { loginOtpTries: 1 } },
      );
    }
    res.status(401);
    throw new Error("Invalid or expired OTP");
  }
  user.loginOtpHash = undefined;
  user.loginOtpExpires = undefined;
  user.loginOtpTries = 0;
  user.failedLogins = 0;
  user.lockUntil = undefined;
  return user;
};

// WhatsApp OTP login - step 2: verify the code, lift any password lock and sign in.
const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (typeof phone !== "string" || typeof otp !== "string" || !phone || !otp) {
    res.status(400);
    throw new Error("Phone and OTP are required");
  }
  const user = await consumeOtp(res, phone, otp);
  user.phoneVerified = true; // holding the phone and reading the code proves the number
  await completeSignIn(req, res, user);
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const tenant = user.tenantId
    ? await Tenant.findById(user.tenantId).select(
        "name plan status planExpiresAt onboarded",
      )
    : null;

  res.json({
    success: true,
    data: {
      ...user.toObject(),
      tenant: tenant
        ? {
            _id: tenant._id,
            name: tenant.name,
            plan: tenant.plan,
            status: tenant.status,
            onboarded: tenant.onboarded !== false,
          }
        : null,
    },
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, department } = req.body;

  if (name && (name.trim().length < 2 || name.trim().length > 80)) {
    res.status(400);
    throw new Error("Name must be between 2 and 80 characters");
  }

  const user = await User.findById(req.user._id);

  if (name) user.name = name.trim();
  if (phone !== undefined && phone.trim() !== (user.phone || "")) {
    user.phone = phone.trim();
    user.phoneVerified = false; // a new number has to be proven again
  }
  if (department !== undefined) user.department = department.trim();

  const updated = await user.save();

  logActivity({
    user: req.user,
    action: "PROFILE_UPDATED",
    module: "Auth",
    description: `${req.user.name} updated their profile`,
    targetId: req.user._id,
    ip: req.ip,
  });

  res.json({ success: true, data: updated });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Current and new password are required");
  }

  if (!STRONG_PASSWORD_RE.test(newPassword)) {
    res.status(400);
    throw new Error(STRONG_PASSWORD_MSG);
  }

  if (currentPassword === newPassword) {
    res.status(400);
    throw new Error("New password must be different from current password");
  }

  const user = await User.findById(req.user._id).select("+password");

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    res.status(400);
    throw new Error("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();
  // every other device is signed out; this one gets a fresh session
  await Session.deleteMany({ userId: user._id });
  const sid = await startSession(req, user);
  sendSecurityAlertEmail({ to: user.email, name: user.name, what: "Your NestGym password was just changed." });

  logActivity({
    user: req.user,
    action: "PASSWORD_CHANGED",
    module: "Auth",
    description: `${req.user.name} changed their password`,
    targetId: req.user._id,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: "Password updated successfully",
    data: { token: generateToken(user._id, sid), refreshToken: await issueRefresh(req, res, sid) },
  });
});

// Onboarding wizard: saves the gym's details; `complete` unlocks the app (after payment or by taking the trial).
const saveOnboarding = asyncHandler(async (req, res) => {
  if (req.user.role !== "gym_owner" || !req.user.tenantId) {
    res.status(403);
    throw new Error("Only the gym owner can do this");
  }
  const str = (v, max) =>
    typeof v === "string" ? v.trim().slice(0, max) : undefined;
  const { name, email, phone, address, gst, pan, complete } = req.body;
  const tenantSet = {};
  const settingSet = {};
  const n = str(name, 120);
  if (n !== undefined) {
    if (n.length < 2) {
      res.status(400);
      throw new Error("Gym name must be at least 2 characters");
    }
    tenantSet.name = n;
    settingSet.companyName = n;
  }
  const e = str(email, 120);
  if (e) {
    if (!validator.isEmail(e)) {
      res.status(400);
      throw new Error("Please enter a valid email address");
    }
    tenantSet.email = e.toLowerCase();
    settingSet.companyEmail = e.toLowerCase();
  }
  const ph = str(phone, 20);
  if (ph) {
    if (String(ph).replace(/\D/g, "").length < 10) {
      res.status(400);
      throw new Error("Phone number must have at least 10 digits");
    }
    tenantSet.phone = ph;
    settingSet.companyPhone = ph;
  }
  const ad = str(address, 300);
  if (ad !== undefined) settingSet.companyAddress = ad;
  const g = str(gst, 15);
  if (g) {
    if (
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.toUpperCase())
    ) {
      res.status(400);
      throw new Error(
        "Please enter a valid GST number (format: 27AABCT1234A1Z5)",
      );
    }
    settingSet.companyGST = g.toUpperCase();
  }
  const pn = str(pan, 10);
  if (pn) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pn.toUpperCase())) {
      res.status(400);
      throw new Error("Please enter a valid PAN number (format: AAAAA0000A)");
    }
    settingSet.companyPAN = pn.toUpperCase();
  }
  if (complete === true) tenantSet.onboarded = true;

  const tenantId = req.user.tenantId;
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: tenantSet },
    { new: true },
  );
  if (Object.keys(settingSet).length) {
    const Setting = require("../models/Setting");
    await Setting.findOneAndUpdate(
      { tenantId },
      { $set: settingSet },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  res.json({
    success: true,
    data: {
      _id: tenant._id,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      onboarded: tenant.onboarded !== false,
    },
  });
});

module.exports = {
  saveOnboarding,
  register,
  login,
  sendOtp,
  verifyOtp,
  getMe,
  updateProfile,
  changePassword,
};
