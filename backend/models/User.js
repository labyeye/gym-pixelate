const mongoose = require("mongoose");
const { uploadedPhoto } = require("../utils/uploadedPhoto");
const bcrypt = require("bcryptjs");

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

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
