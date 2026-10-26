const mongoose = require("mongoose");
const { uploadedPhoto } = require("../utils/uploadedPhoto");
const bcrypt = require("bcryptjs");
const { addPasswordPolicy } = require("../utils/passwordPolicy");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, // was limited to 2-3 letter TLDs (.gym, .fitness, .co.in failed)
        "Please add a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: [
        "super_admin",
        "gym_owner",
        "branch_manager",
        "receptionist",
        "trainer",
        "accountant",
        "member",
      ],
      default: "receptionist",
    },
    phone: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      validate: [uploadedPhoto, "Photos must be uploaded, not linked"],
    },
    employeeId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    lastLogin: {
      type: Date,
    },
    // Brute-force guard: the 4th wrong password locks the account for 30 minutes (WhatsApp OTP unlocks).
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date },
    // WhatsApp OTP login; 5 wrong guesses burn the code.
    loginOtpHash: { type: String, select: false },
    loginOtpExpires: { type: Date, select: false },
    loginOtpTries: { type: Number, default: 0, select: false },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    monthlySalary: { type: Number, min: 0, default: 0 }, // payroll base for staff accounts
    // only meaningful for role "trainer"
    trainerProfile: {
      specializations: [{ type: String, trim: true }], // weight training, yoga, crossfit, rehab...
      certifications: [{ type: String, trim: true }],
      experienceYears: { type: Number, min: 0 },
      bio: { type: String, trim: true },
      ptRate: { type: Number, min: 0 }, // default price per PT session
      commissionPercent: { type: Number, min: 0, max: 100 },
      shift: { type: String, trim: true }, // "06:00-14:00"
      maxClients: { type: Number, min: 0 },
      // personal + HR details (photo itself lives in User.avatar)
      dob: { type: Date },
      gender: { type: String, enum: ["male", "female", "other", ""] },
      bloodGroup: { type: String, trim: true },
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      pincode: { type: String, trim: true },
      languages: [{ type: String, trim: true }],
      joiningDate: { type: Date },
      employmentType: { type: String, enum: ["full_time", "part_time", "freelance", ""] },
      emergencyContact: {
        name: { type: String, trim: true },
        phone: { type: String, trim: true },
        relation: { type: String, trim: true },
      },
      idProof: {
        type: { type: String, trim: true },
        number: { type: String, trim: true },
      },
    },
  },
  {
    timestamps: true,
  },
);
userSchema.add({
  passwordChangedAt: { type: Date },
  // Authenticator-app 2FA (TOTP). Recovery codes live in backupCodes (hashes only).
  twoFactorSecret: { type: String, select: false },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorFailedAttempts: { type: Number, default: 0 },
  twoFactorLockUntil: { type: Date },
  backupCodes: { type: [{ hash: String, usedAt: Date }], default: [], select: false },
  backupCodesGeneratedAt: { type: Date },
  // WebAuthn passkeys; publicKey is base64url of the COSE key.
  passkeys: {
    type: [
      {
        credentialId: { type: String, required: true },
        publicKey: { type: String, required: true },
        counter: { type: Number, default: 0 },
        transports: [String],
        name: { type: String, default: "Passkey" },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date },
      },
    ],
    default: [],
    select: false,
  },
  // Proven ownership of phone / email. Phone gates WhatsApp password reset; both reset on change.
  phoneVerified: { type: Boolean, default: false },
  phoneVerifyOtp: { type: String, select: false },
  phoneVerifyOtpExpire: { type: Date, select: false },
  phoneVerifyOtpTries: { type: Number, default: 0, select: false },
  emailVerified: { type: Boolean, default: false },
  pendingEmail: { type: String, select: false },
  contactOtp: { type: String, select: false },
  contactOtpExpire: { type: Date, select: false },
  contactOtpTries: { type: Number, default: 0, select: false },
  // email OTP sign-in
  emailLoginOtp: { type: String, select: false },
  emailLoginOtpExpire: { type: Date, select: false },
  emailLoginOtpTries: { type: Number, default: 0, select: false },
  // password reset: emailed link (hashed token) or WhatsApp code
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpire: { type: Date, select: false },
  resetOtp: { type: String, select: false },
  resetOtpExpire: { type: Date, select: false },
  resetOtpTries: { type: Number, default: 0, select: false },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  // tokens issued before this moment stop working (see middleware/auth.js)
  if (!this.isNew) this.passwordChangedAt = new Date();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Terms & Privacy acceptance (see utils/terms.js)
userSchema.add({
  termsVersion: { type: String },
  termsAcceptedAt: { type: Date },
  termsAcceptedIp: { type: String },
  termsAcceptedAgent: { type: String },
});

// 8+ chars with upper/lower/number/special, no simple series, not among the last 5 passwords
addPasswordPolicy(userSchema);

module.exports = mongoose.model("User", userSchema);
