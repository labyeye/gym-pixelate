const mongoose = require("mongoose");
const { uploadedPhoto } = require("../utils/uploadedPhoto");

const memberSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    }, // portal login, if granted
    memberCode: { type: String, trim: true }, // GYM-00042, tenant-scoped, printed on card / QR
    name: { type: String, required: [true, "Please add a name"], trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: {
      type: String,
      required: [true, "Please add a phone number"],
      trim: true,
    },
    altPhone: { type: String, trim: true },
    whatsappOptIn: { type: Boolean, default: true },
    photo: { type: String, validate: [uploadedPhoto, "Photos must be uploaded, not linked"] },
    gender: { type: String, enum: ["male", "female", "other"] },
    dob: { type: Date },
    anniversary: { type: Date },
    occupation: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    idProof: {
      type: {
        type: String,
        enum: [
          "aadhaar",
          "pan",
          "driving_license",
          "passport",
          "voter_id",
          "other",
        ],
      },
      number: { type: String, trim: true },
      file: { type: String },
    },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      relation: { type: String, trim: true },
    },
    // PAR-Q style health screen, captured at joining
    health: {
      bloodGroup: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
        default: "",
      },
      conditions: [{ type: String, trim: true }], // diabetes, hypertension, asthma, heart, thyroid, pcos...
      injuries: { type: String, trim: true },
      allergies: { type: String, trim: true },
      medications: { type: String, trim: true },
      pregnant: { type: Boolean, default: false },
      doctorClearance: { type: Boolean, default: false },
      declarationSignedAt: { type: Date }, // liability waiver / PAR-Q accepted
    },
    medicalNotes: { type: String, trim: true },
    fitness: {
      goal: {
        type: String,
        enum: [
          "weight_loss",
          "muscle_gain",
          "strength",
          "endurance",
          "flexibility",
          "general_fitness",
          "rehab",
          "sports",
          "",
        ],
        default: "",
      },
      level: {
        type: String,
        enum: ["beginner", "intermediate", "advanced", ""],
        default: "",
      },
      heightCm: { type: Number, min: 0 },
      startWeightKg: { type: Number, min: 0 },
      targetWeightKg: { type: Number, min: 0 },
      preferredSlot: {
        type: String,
        enum: ["early_morning", "morning", "afternoon", "evening", "night", ""],
        default: "",
      },
    },
    source: {
      type: String,
      enum: [
        "walk_in",
        "referral",
        "instagram",
        "facebook",
        "google",
        "website",
        "whatsapp",
        "poster",
        "corporate",
        "other",
        "",
      ],
      default: "",
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
    },
    joinedOn: { type: Date, default: Date.now },
    tags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["active", "inactive", "blacklisted"],
      default: "active",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

memberSchema.index({ tenantId: 1, branchId: 1 });
memberSchema.index(
  { tenantId: 1, memberCode: 1 },
  {
    unique: true,
    partialFilterExpression: { memberCode: { $type: "string" } },
  },
);
memberSchema.index({ tenantId: 1, phone: 1 });
memberSchema.index({
  name: "text",
  email: "text",
  phone: "text",
  memberCode: "text",
});

module.exports = mongoose.model("Member", memberSchema);
