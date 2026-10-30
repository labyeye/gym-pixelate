const mongoose = require("mongoose");
const { uploadedPhoto } = require("../utils/uploadedPhoto");

const settingSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      default: "NestGym",
    },
    companyAddress: {
      type: String,
      default: "",
    },
    companyPhone: {
      type: String,
      default: "",
    },
    companyEmail: {
      type: String,
      default: "",
    },
    companyGST: {
      type: String,
      default: "",
    },
    companyPAN: {
      type: String,
      default: "",
    },
    gymTiming: {
      open: { type: String, default: "06:00" },
      close: { type: String, default: "22:00" },
    },
    invoicePrefix: {
      type: String,
      default: "INV",
    },
    invoiceFooter: {
      type: String,
      default: "Thank you for training with us!",
    },
    logoUrl: {
      type: String,
      default: "",
      validate: [uploadedPhoto, "Photos must be uploaded, not linked"],
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },

    // the gym's OWN Razorpay account for member payments (secret is AES-encrypted and never sent to the browser)
    onlinePaymentsEnabled: { type: Boolean, default: false },
    // owners/managers must turn on two-factor before they can use the app
    require2fa: { type: Boolean, default: false },
    // rupees credited to a member's wallet when someone they referred buys their first plan (0 = off)
    referralReward: { type: Number, default: 0, min: 0 },
    // master switch for every WhatsApp message NestGym sends to members for this gym (reminders and fee payment links)
    whatsappEnabled: { type: Boolean, default: true },
    // automatic WhatsApp reminders to members (utils/reminders.js); all off until the owner turns them on
    // (paymentLink = the monthly "pay your fee" link, which has always been on)
    reminders: {
      paymentLink: { type: Boolean, default: true },
      expiring: { type: Boolean, default: false },
      expired: { type: Boolean, default: false },
      birthday: { type: Boolean, default: false },
    },
    // wipe personal data of members whose last membership ended this many months ago (0 = never)
    retentionMonths: { type: Number, default: 0, min: 0, max: 120 },
    razorpayKeyId: { type: String, default: "" },
    razorpayKeySecretEnc: { type: String, select: false },
    razorpayWebhookSecretEnc: { type: String, select: false },

    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // optional modules the owner switched off in Settings > Modules, e.g. { pos: false }; a missing key means ON
    modules: { type: mongoose.Schema.Types.Mixed, default: {} },

    // invoice layout from the Invoice Designer (validated by utils/invoiceTemplate.js); null = the classic layout
    invoiceTemplate: { type: mongoose.Schema.Types.Mixed, default: null },

    // member receipt look (cheque-style or standard), sanitised in settingController
    receiptDesign: { type: mongoose.Schema.Types.Mixed, default: null },

    // printed on the invoice: bank details, website, state, terms
    companyWebsite: { type: String, default: "" },
    companyState: { type: String, default: "" },
    companyStateCode: { type: String, default: "" },
    bankName: { type: String, default: "" },
    bankAccountName: { type: String, default: "" },
    bankAccountNumber: { type: String, default: "" },
    bankIFSC: { type: String, default: "" },
    bankBranch: { type: String, default: "" },
    bankAccountType: { type: String, default: "" },
    invoiceTerms: { type: [String], default: [] },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Setting", settingSchema);
