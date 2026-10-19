const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const { protect } = require("../middleware/auth");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Tenant = require("../models/Tenant");
const Subscription = require("../models/Subscription");

const { PLAN_LIMITS, PLAN_PRICES_MONTHLY, PLAN_PRICES_YEARLY } = Subscription;
const { sendWelcomeEmail } = require("../utils/emailService");

function hdfcEncrypt(plainText, workingKey) {
  const keyBytes = crypto.createHash("md5").update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv("aes-128-cbc", keyBytes, iv);
  return cipher.update(plainText, "utf8", "hex") + cipher.final("hex");
}

function hdfcDecrypt(encText, workingKey) {
  const keyBytes = crypto.createHash("md5").update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-128-cbc", keyBytes, iv);
  return decipher.update(encText, "hex", "utf8") + decipher.final("utf8");
}

function getHdfcConfig() {
  const merchantId = process.env.HDFC_MERCHANT_ID;
  const workingKey = process.env.HDFC_WORKING_KEY;
  const accessCode = process.env.HDFC_ACCESS_CODE;
  if (!merchantId || !workingKey || !accessCode) {
    throw new Error("HDFC Payment Gateway not configured");
  }
  const isProduction = process.env.NODE_ENV === "production";
  const gatewayUrl = isProduction
    ? "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction"
    : "https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction";
  return { merchantId, workingKey, accessCode, gatewayUrl };
}

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
        hdfcPaymentId: inv.hdfcPaymentId,
        hdfcTrackingId: inv.hdfcTrackingId,
      }));

    res.json({ success: true, data: invoices });
  }),
);

router.post(
  "/hdfc/create-order",
  protect,
  asyncHandler(async (req, res) => {
    const { plan, billingCycle = "monthly" } = req.body;

    if (!PAID_PLANS.includes(plan)) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    const { merchantId, workingKey, accessCode, gatewayUrl } = getHdfcConfig();

    if (!CYCLES.includes(billingCycle)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid billing cycle" });
    }
    const amountPaise = Subscription.planPrice(plan, billingCycle);
    const amountRupees = (amountPaise / 100).toFixed(2);

    const orderId = `ORD_${req.user.tenantId}_${Date.now()}`;
    const backendUrl =
      process.env.BACKEND_URL || `https://leads-backend.pixelatenest.com`;
    const frontendUrl =
      process.env.CLIENT_URL || `https://leads.pixelatenest.com`;

    const tenant = await Tenant.findById(req.user.tenantId);
    const billingName = tenant?.name || req.user.name || "Customer";
    const billingEmail = tenant?.email || req.user.email || "";
    const billingPhone = tenant?.phone || "";

    const params = [
      `merchant_id=${merchantId}`,
      `order_id=${orderId}`,
      `amount=${amountRupees}`,
      `currency=INR`,
      `language=EN`,
      `billing_name=${billingName}`,
      `billing_tel=${billingPhone}`,
      `billing_email=${billingEmail}`,
      `billing_address=NA`,
      `billing_city=NA`,
      `billing_state=NA`,
      `billing_zip=000000`,
      `billing_country=India`,
      `delivery_name=${billingName}`,
      `delivery_address=NA`,
      `delivery_city=NA`,
      `delivery_state=NA`,
      `delivery_zip=000000`,
      `delivery_country=India`,
      `merchant_param1=${plan}`,
      `merchant_param2=${billingCycle}`,
      `merchant_param3=${req.user.tenantId}`,
      `redirect_url=${backendUrl}/api/billing/hdfc/response`,
      `cancel_url=${frontendUrl}/billing?payment=cancelled`,
    ].join("&");

    const encRequest = hdfcEncrypt(params, workingKey);

    res.json({
      success: true,
      data: { encRequest, accessCode, gatewayUrl, orderId },
    });
  }),
);

router.post(
  "/hdfc/response",
  asyncHandler(async (req, res) => {
    const { encResp } = req.body;
    const frontendUrl =
      process.env.CLIENT_URL || "https://leads.pixelatenest.com";

    if (!encResp) {
      return res.redirect(
        `${frontendUrl}/billing?payment=failed&reason=no_response`,
      );
    }

    let workingKey;
    try {
      workingKey = process.env.HDFC_WORKING_KEY;
      if (!workingKey) throw new Error("no key");
    } catch {
      return res.redirect(
        `${frontendUrl}/billing?payment=failed&reason=config_error`,
      );
    }

    let orderStatus, plan, billingCycle, tenantId, trackingId, orderId, amount;
    try {
      const decrypted = hdfcDecrypt(encResp, workingKey);
      const params = Object.fromEntries(
        decrypted.split("&").map((pair) => {
          const [k, ...v] = pair.split("=");
          return [k, v.join("=")];
        }),
      );
      orderStatus = params.order_status;
      plan = params.merchant_param1;
      billingCycle = params.merchant_param2;
      tenantId = params.merchant_param3;
      trackingId = params.tracking_id;
      orderId = params.order_id;
      amount = parseFloat(params.amount) * 100;
    } catch {
      return res.redirect(
        `${frontendUrl}/billing?payment=failed&reason=decrypt_error`,
      );
    }

    if (orderStatus !== "Success") {
      return res.redirect(
        `${frontendUrl}/billing?payment=failed&reason=${encodeURIComponent(orderStatus || "unknown")}`,
      );
    }

    if (!PAID_PLANS.includes(plan)) {
      return res.redirect(
        `${frontendUrl}/billing?payment=failed&reason=invalid_plan`,
      );
    }

    try {
      const periodEnd = addTerm(new Date(), billingCycle);

      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        {
          plan,
          planExpiresAt: periodEnd,
          status: "active",
          limits: limitsFor(plan),
        },
        { new: true },
      );

      const billNo = await nextBillNumber();
      await Subscription.findOneAndUpdate(
        { tenant: tenant._id },
        {
          plan,
          billingCycle,
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          $push: {
            invoices: {
              invoiceNumber: billNo,
              hdfcPaymentId: orderId,
              hdfcTrackingId: trackingId,
              amount: Math.round(amount),
              plan,
              billingCycle,
              status: "paid",
              paidAt: new Date(),
            },
          },
        },
        { upsert: true, new: true },
      );
    } catch (err) {
      console.error("HDFC response DB error:", err);
      return res.redirect(
        `${frontendUrl}/billing?payment=failed&reason=db_error`,
      );
    }

    return res.redirect(
      `${frontendUrl}/billing?payment=success&plan=${plan}&billingCycle=${billingCycle}`,
    );
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
        const subscription = await Subscription.findOne({
          tenant: req.user.tenantId,
        });

        if (!subscription?.pendingOrder) {
          return res.status(400).json({
            success: false,
            message: "Order not found",
          });
        }

        const { plan, billingCycle, amount } = subscription.pendingOrder;
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

module.exports = router;
