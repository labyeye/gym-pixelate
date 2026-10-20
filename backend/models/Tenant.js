const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organisation name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    ownerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan: {
      type: String,
      enum: [
        "trial",
        "starter",
        "growth",
        "pro",
        "elite",
        "enterprise",
        "professional",
        "business",
      ],
      default: "trial",
    },
    // false right after signup; the onboarding wizard (details -> plan -> pay or trial) flips it.
    // default true so every tenant that existed before the wizard keeps working.
    onboarded: { type: Boolean, default: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    planExpiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    status: {
      type: String,
      enum: ["active", "suspended", "cancelled"],
      default: "active",
    },
    // null = unlimited (Infinity does not survive JSON)
    limits: {
      members: { type: Number, default: 100 },
      branches: { type: Number, default: 1 },
      staff: { type: Number, default: 5 },
    },
    integrations: {
      indiamart: {
        enabled: { type: Boolean, default: false },
        apiKey: { type: String, default: "" },
        lastSync: { type: Date, default: null },
        assigneeIds: { type: [String], default: [] },
      },
      facebook: {
        enabled: { type: Boolean, default: false },
        userAccessToken: { type: String, default: "" },
        oauthUserId: { type: String, default: "" },

        pages: [
          {
            pageId: { type: String, required: true },
            pageName: { type: String, default: "" },
            accessToken: { type: String, default: "" },
            selectedFormIds: { type: [String], default: [] },

            allowedStates: { type: [String], default: [] },
            defaultAssigneeId: { type: String, default: "" },
            webhookVerified: { type: Boolean, default: false },
            connectedAt: { type: Date, default: null },
          },
        ],
      },
      tradeindia: {
        enabled: { type: Boolean, default: false },
        userId: { type: String, default: "" },
        apiKey: { type: String, default: "" },
      },
      googleAds: {
        enabled: { type: Boolean, default: false },
        refreshToken: { type: String, default: "" },
        oauthUserId: { type: String, default: "" },
        loginCustomerId: { type: String, default: "" },

        accounts: [
          {
            customerId: { type: String, required: true },
            customerName: { type: String, default: "" },
            selectedCampaignIds: { type: [String], default: [] },

            allowedStates: { type: [String], default: [] },
            defaultAssigneeId: { type: String, default: "" },
            webhookKey: { type: String, default: "" },
            connectedAt: { type: Date, default: null },
          },
        ],
      },
      justdial: {
        enabled: { type: Boolean, default: false },
        apiKey: { type: String, default: "" },
      },
      whatsapp: {
        enabled: { type: Boolean, default: false },
        isConnected: { type: Boolean, default: false },
        wabaId: { type: String, default: "" },

        accessToken: { type: String, default: "" },
        webhookVerifyToken: { type: String, default: "" },
        lastSyncAt: { type: Date, default: null },

        phoneNumbers: [
          {
            phoneNumberId: { type: String, required: true },
            label: { type: String, default: "" },
            businessName: { type: String, default: "" },
            phoneNumber: { type: String, default: "" },
            approvedTemplateCount: { type: Number, default: 0 },
            addedAt: { type: Date, default: Date.now },
          },
        ],
      },
    },
    leadsTableColumns: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    razorpay: {
      customerId: { type: String, default: null },
      subscriptionId: { type: String, default: null },
    },
    apiKeys: [
      {
        name: { type: String, required: true },
        keyHash: { type: String, required: true },
        keyPrefix: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: null },
        active: { type: Boolean, default: true },
        // Owner-configured fields for the website form
        fields: [
          {
            key: { type: String, required: true }, // 'email','company','requirement','budget','location','product'
            label: { type: String, required: true }, // display label
            type: { type: String, default: "text" }, // 'text','textarea','email','tel'
            required: { type: Boolean, default: false },
          },
        ],
      },
    ],
    // Set from the CRM dashboard for custom deals; shown on the customer's billing page instead of the defaults.
    customPlanName: { type: String, trim: true },
    customFeatures: { type: [String], default: undefined },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Tenant", tenantSchema);
