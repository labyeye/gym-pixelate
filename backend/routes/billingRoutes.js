const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { protect } = require("../middleware/auth");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Tenant = require("../models/Tenant");
const Subscription = require("../models/Subscription");
const { Saga, refundAfterFailure } = require("../utils/paymentSaga");

const { PLAN_LIMITS, PLAN_PRICES_MONTHLY, PLAN_PRICES_YEARLY } = Subscription;
const { sendWelcomeEmail } = require("../utils/emailService");

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const e = new Error(
      "Online payments are not set up yet. Please contact support.",
    );
    e.status = 503;
    throw e;
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");
  return expectedSignature === signature;
}

const PAID_PLANS = [
  "starter",
  "growth",
  "pro",
  "elite",
  "professional",
  "business",
];
const CYCLES = ["monthly", "quarterly", "half_yearly", "yearly"];
const unlimited = (n) => (n === Infinity ? null : n);
const limitsFor = (plan) => {
  const l = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
  return {
    members: unlimited(l.members),
    branches: unlimited(l.branches),
    staff: unlimited(l.staff),
  };
};
const addTerm = (from, cycle) => {
  const d = new Date(from);
  d.setMonth(d.getMonth() + (Subscription.TERM_MONTHS[cycle] || 1));
  return d;
};
const priceTerms = (plan) =>
  Object.fromEntries(CYCLES.map((c) => [c, Subscription.planPrice(plan, c)]));

// Market-benchmarked gym-software tiers (see models/Subscription.js).
router.get("/plans", (req, res) => {
  const card = (key, name, extra) => ({
    name,
    currency: "INR",
    priceMonthly: PLAN_PRICES_MONTHLY[key],
    priceYearly: PLAN_PRICES_YEARLY[key],
    prices: priceTerms(key),
    termDiscount: Subscription.TERM_DISCOUNT,
    limits: limitsFor(key),
    trialDays: Subscription.TRIAL_DAYS,
    ...extra,
  });
  res.json({
    success: true,
    data: {
      starter: card("starter", "Starter", {
        members: 150,
        features: [
          "Up to 150 active members, 1 branch",
          "Membership plans, dues & renewals",
          "GST invoices & part-payments",
          "QR / manual attendance",
          "Enquiry & free-trial tracking",
          "Email support",
        ],
      }),
      growth: card("growth", "Growth", {
        members: 500,
        popular: true,
        features: [
          "Up to 500 active members, 1 branch",
          "Everything in Starter",
          "One-tap WhatsApp renewal & due reminders",
          "Face-recognition check-in",
          "Group classes, bookings & waitlist",
          "Personal-training packages & trainer commission",
          "Workout & diet plans, body progress",
          "Lockers, POS & expenses",
          "Priority support",
        ],
      }),
      pro: card("pro", "Pro", {
        members: 1500,
        features: [
          "Up to 1,500 active members, 3 branches",
          "Everything in Growth",
          "Staff attendance & payroll",
          "Equipment maintenance tracker",
          "Coupons & offers",
          "Advanced reports, GST register & P&L",
          "Peak-hour and churn-risk insights",
        ],
      }),
      elite: card("elite", "Elite", {
        members: null,
        features: [
          "Unlimited members, up to 10 branches",
          "Everything in Pro",
          "Dedicated account manager",
          "Data migration from your old software",
          "Phone support",
        ],
      }),
      enterprise: {
        name: "Enterprise",
        currency: "INR",
        priceMonthly: null,
        priceYearly: null,
        prices: null,
        limits: limitsFor("enterprise"),
        custom: true,
        features: [
          "Franchise chains, 10+ branches",
          "Custom integrations & SLA",
          "On-premise / private cloud option",
          "Custom reporting",
        ],
      },
    },
  });
});

router.get(
  "/subscription",
  protect,
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant)
      return res
        .status(404)
        .json({ success: false, message: "Tenant not found" });

    const subscription = await Subscription.findOne({ tenant: tenant._id });
    res.json({ success: true, data: { tenant, subscription } });
  }),
);

/** next global bill number, KHT/GYM/001 (counts every paid subscription invoice) */
async function nextBillNumber() {
  const r = await Subscription.aggregate([
    { $unwind: "$invoices" },
    { $match: { "invoices.status": "paid" } },
    { $count: "total" },
  ]);
  return `KHT/GYM/${String((r[0]?.total || 0) + 1).padStart(3, "0")}`;
}

router.get(
  "/invoices",
  protect,
  asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
      tenant: req.user.tenantId,
    });
    if (!subscription) return res.json({ success: true, data: [] });

    const invoices = (subscription.invoices || [])
      .filter((inv) => inv.status === "paid")
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
      .slice(0, 24)
      .map((inv, i, arr) => ({
        _id: inv._id,
        // older invoices (before numbers were stored) get a number by paid order within this gym
        invoiceNumber:
          inv.invoiceNumber ||
          `KHT/GYM/${String(arr.length - i).padStart(3, "0")}`,
        plan: inv.plan,
        billingCycle: inv.billingCycle,
        amount: Math.round(inv.amount) / 100, // stored in paise
        currency: inv.currency || "INR",
        status: inv.status,
        paidAt: inv.paidAt,
      }));

    res.json({ success: true, data: invoices });
  }),
);

router.post(
  "/razorpay/create-order",
  protect,
  asyncHandler(async (req, res) => {
    const { plan, billingCycle = "monthly" } = req.body;

    if (!PAID_PLANS.includes(plan)) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    const razorpay = getRazorpayInstance();
    if (!CYCLES.includes(billingCycle)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid billing cycle" });
    }
    const amountPaise = Subscription.planPrice(plan, billingCycle);

    const tenant = await Tenant.findById(req.user.tenantId);
    const customerName = tenant?.name || req.user.name || "Customer";
    const customerEmail = tenant?.email || req.user.email || "";
    const customerPhone = tenant?.phone || "";

    try {
      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `ORD_${req.user.tenantId.toString().slice(-10)}_${Date.now()}`,
        notes: {
          plan,
          billingCycle,
          tenantId: req.user.tenantId.toString(),
          customerName,
          customerEmail,
        },
      });

      const subscription = await Subscription.findOneAndUpdate(
        { tenant: req.user.tenantId },
        {
          pendingOrder: {
            razorpayOrderId: order.id,
            plan,
            billingCycle,
            amount: amountPaise / 100,
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );

      res.json({
        success: true,
        data: {
          orderId: order.id,
          amount: amountPaise,
          currency: "INR",
          customerEmail,
          customerPhone,
          customerName,
          key: process.env.RAZORPAY_KEY_ID,
        },
      });
    } catch (err) {
      const errMsg =
        err?.error?.description || err?.message || JSON.stringify(err);
      console.error("Razorpay create-order error:", JSON.stringify(err));
      res.status(400).json({
        success: false,
        message: "Failed to create order",
        error: errMsg,
      });
    }
  }),
);

router.post(
  "/razorpay/verify",
  protect,
  asyncHandler(async (req, res) => {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment details",
      });
    }

    const isSignatureValid = verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );

    if (!isSignatureValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    try {
      const razorpay = getRazorpayInstance();
      const payment = await razorpay.payments.fetch(razorpayPaymentId);

      if (payment.status === "captured") {
        // money is taken: from here on, any failure undoes our writes and refunds the customer
        const saga = new Saga();
        saga.amount = payment.amount / 100;
        try {
        const subscription = await Subscription.findOne({
          tenant: req.user.tenantId,
        });

        if (!subscription?.pendingOrder) {
          throw new Error("Order not found for this payment");
        }

        const { plan, billingCycle, amount } = subscription.pendingOrder;
        saga.amount = amount;
        const beforeSub = subscription.toObject();
        saga.onRollback("restore subscription", () => Subscription.replaceOne({ _id: subscription._id }, beforeSub));
        const amountPaise = Math.round(amount * 100);

        const invoiceNumber = await nextBillNumber();

        const updatedSubscription = await Subscription.findOneAndUpdate(
          { tenant: req.user.tenantId },
          {
            plan,
            billingCycle,
            status: "active",
            startDate: new Date(),
            nextBillingDate: addTerm(new Date(), billingCycle),
            amount,
            paymentMethod: "razorpay",
            paymentDetails: {
              razorpayOrderId,
              razorpayPaymentId,
              status: payment.status,
            },
            $unset: { pendingOrder: 1 },
            $push: {
              invoices: {
                invoiceNumber,
                razorpayPaymentId,
                razorpayOrderId,
                amount: amountPaise,
                plan,
                billingCycle,
                status: "paid",
                paidAt: new Date(),
              },
            },
          },
          { new: true },
        );

        const beforeTenant = await Tenant.findById(req.user.tenantId).lean();
        saga.onRollback("restore tenant", () => Tenant.replaceOne({ _id: req.user.tenantId }, beforeTenant));
        const updatedTenant = await Tenant.findByIdAndUpdate(
          req.user.tenantId,
          {
            plan,
            planExpiresAt: addTerm(new Date(), billingCycle),
            status: "active",
            limits: limitsFor(plan),
          },
          { new: true },
        );

        require("../utils/credits").onSubscriptionPaid(req.user.tenantId, { amountPaid: amount, refId: razorpayPaymentId }).catch((err) => console.error("[Credits]", err.message));
        sendWelcomeEmail({
          to: updatedTenant?.email || req.user.email,
          companyName: updatedTenant?.name || req.user.name || "Team",
          userName: req.user.name || "there",
          plan,
          billingCycle,
          amountRupees: amount,
          paymentId: razorpayPaymentId,
          invoiceNumber,
        }).catch((err) => console.error("Welcome email failed:", err.message));

        res.json({
          success: true,
          message: "Payment successful",
          data: {
            plan,
            billingCycle,
            status: updatedSubscription.status,
          },
        });
        } catch (err) {
          const undone = await saga.rollback();
          try {
            await refundAfterFailure(
              {
                gateway: "razorpay",
                paymentId: razorpayPaymentId,
                orderId: razorpayOrderId,
                amount: saga.amount,
                product: "NestGym subscription",
                ownerId: req.user.tenantId,
                userId: req.user._id,
              },
              err,
              undone,
            );
          } catch (e) {
            if (e.refund) return res.status(409).json({ success: false, refund: true, message: e.message });
            throw e;
          }
        }
      } else {
        res.status(400).json({
          success: false,
          message: `Payment ${payment.status}`,
        });
      }
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Verification failed",
        error: err.message,
      });
    }
  }),
);

router.post(
  "/cancel",
  protect,
  asyncHandler(async (req, res) => {
    await Subscription.findOneAndUpdate(
      { tenant: req.user.tenantId },
      { status: "cancelled", cancelledAt: new Date() },
    );
    res.json({ success: true, message: "Subscription cancelled" });
  }),
);

// Activates a paid Razorpay order without a signed-in browser (used when only the webhook told us about the payment).
// Same steps and the same refund protection as the browser's verify call above.
async function provisionRazorpay({ orderId, paymentId }) {
  const subscription = await Subscription.findOne({ "pendingOrder.razorpayOrderId": orderId });
  if (!subscription) throw new Error(`No pending order for ${orderId}`);
  const tenantId = subscription.tenant;
  const { plan, billingCycle, amount } = subscription.pendingOrder;
  const amountPaise = Math.round(amount * 100);
  const saga = new Saga();
  saga.amount = amount;
  try {
    const beforeSub = subscription.toObject();
    saga.onRollback("restore subscription", () => Subscription.replaceOne({ _id: subscription._id }, beforeSub));
    const invoiceNumber = await nextBillNumber();
    await Subscription.findOneAndUpdate(
      { tenant: tenantId },
      {
        plan,
        billingCycle,
        status: "active",
        startDate: new Date(),
        nextBillingDate: addTerm(new Date(), billingCycle),
        amount,
        paymentMethod: "razorpay",
        paymentDetails: { razorpayOrderId: orderId, razorpayPaymentId: paymentId, status: "captured" },
        $unset: { pendingOrder: 1 },
        $push: { invoices: { invoiceNumber, razorpayPaymentId: paymentId, razorpayOrderId: orderId, amount: amountPaise, plan, billingCycle, status: "paid", paidAt: new Date() } },
      },
      { new: true },
    );
    const beforeTenant = await Tenant.findById(tenantId).lean();
    saga.onRollback("restore tenant", () => Tenant.replaceOne({ _id: tenantId }, beforeTenant));
    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { plan, planExpiresAt: addTerm(new Date(), billingCycle), status: "active", limits: limitsFor(plan) },
      { new: true },
    );
    require("../utils/credits").onSubscriptionPaid(tenantId, { amountPaid: amount, refId: paymentId }).catch((err) => console.error("[Credits]", err.message));
    sendWelcomeEmail({
      to: tenant?.email,
      companyName: tenant?.name || "Team",
      userName: tenant?.name || "there",
      plan,
      billingCycle,
      amountRupees: amount,
      paymentId,
      invoiceNumber,
    }).catch((err) => console.error("Welcome email failed:", err.message));
  } catch (err) {
    const undone = await saga.rollback();
    await refundAfterFailure({ gateway: "razorpay", paymentId, orderId, amount, product: "NestGym subscription", ownerId: tenantId }, err, undone);
  }
}

module.exports = router;
module.exports.provisionRazorpay = provisionRazorpay;

