const mongoose = require("mongoose");

// Tenant's own SaaS subscription to NestGym (not gym membership billing).
const subscriptionSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
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
    billingCycle: {
      type: String,
      enum: ["monthly", "quarterly", "half_yearly", "yearly"],
      default: "monthly",
    },
    status: {
      type: String,
      enum: ["active", "cancelled", "past_due"],
      default: "active",
    },
    startDate: { type: Date },
    trialEndsAt: { type: Date },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    nextBillingDate: { type: Date },
    amount: { type: Number },
    paymentMethod: { type: String },
    paymentDetails: { type: mongoose.Schema.Types.Mixed },
    cancelledAt: { type: Date },
    pendingOrder: { type: mongoose.Schema.Types.Mixed },
    invoices: [
      {
        hdfcPaymentId: String,
        hdfcTrackingId: String,
        razorpayPaymentId: String,
        razorpayOrderId: String,
        amount: Number,
        plan: String,
        billingCycle: String,
        status: {
          type: String,
          enum: ["paid", "failed", "refunded"],
          default: "paid",
        },
        paidAt: Date,
      },
    ],
  },
  { timestamps: true },
);

/*
 * Gym-software market (India, 2026): entry plans Rs 600-900/mo (single branch, ~100-200 members),
 * mid plans Rs 1,300-2,000/mo (~500 members + WhatsApp + app), top tiers Rs 2,500-3,500/mo
 * (unlimited members / multi-branch). Priced per month in paise. Longer terms get a discount
 * (quarterly 10%, half-yearly 20%, yearly 30%) which is the industry norm.
 * Legacy keys (professional, business) are kept so existing subscribers keep working.
 */
const PLAN_PRICES_MONTHLY = {
  starter: 79900, // Rs 799  - up to 150 members, 1 branch
  growth: 149900, // Rs 1,499 - up to 500 members
  pro: 249900, // Rs 2,499 - up to 1,500 members, 3 branches
  elite: 399900, // Rs 3,999 - unlimited members, 10 branches
  enterprise: null, // custom
  professional: 249900, // legacy -> pro
  business: 399900, // legacy -> elite
};

const TERM_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const TERM_DISCOUNT = {
  monthly: 0,
  quarterly: 0.1,
  half_yearly: 0.2,
  yearly: 0.3,
};

/** Total price (paise) to charge for the whole term, or null for custom-priced plans. */
function planPrice(plan, cycle = "monthly") {
  const monthly = PLAN_PRICES_MONTHLY[plan];
  if (monthly == null) return null;
  const months = TERM_MONTHS[cycle] || 1;
  return Math.round(monthly * months * (1 - (TERM_DISCOUNT[cycle] || 0)));
}

const PLAN_PRICES_YEARLY = Object.fromEntries(
  Object.keys(PLAN_PRICES_MONTHLY).map((p) => [p, planPrice(p, "yearly")]),
);

// members: active members cap; branches; staff: user accounts (trainers, desk, accountants)
const PLAN_LIMITS = {
  trial: { members: 100, branches: 1, staff: 5 },
  starter: { members: 150, branches: 1, staff: 5 },
  growth: { members: 500, branches: 1, staff: 15 },
  pro: { members: 1500, branches: 3, staff: 40 },
  elite: { members: Infinity, branches: 10, staff: 150 },
  enterprise: { members: Infinity, branches: Infinity, staff: Infinity },
  professional: { members: 1500, branches: 3, staff: 40 },
  business: { members: Infinity, branches: 10, staff: 150 },
};

const TRIAL_DAYS = 14;

const Subscription = mongoose.model("Subscription", subscriptionSchema);

Subscription.PLAN_LIMITS = PLAN_LIMITS;
Subscription.PLAN_PRICES_MONTHLY = PLAN_PRICES_MONTHLY;
Subscription.PLAN_PRICES_YEARLY = PLAN_PRICES_YEARLY;
Subscription.TERM_MONTHS = TERM_MONTHS;
Subscription.TERM_DISCOUNT = TERM_DISCOUNT;
Subscription.TRIAL_DAYS = TRIAL_DAYS;
Subscription.planPrice = planPrice;

module.exports = Subscription;
