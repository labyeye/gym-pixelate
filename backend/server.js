const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const mongoose = require("mongoose");
const { tenantScopePlugin } = require("./utils/tenantScope");
mongoose.plugin(tenantScopePlugin); // must run before any model is compiled
const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorHandler");

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn("JWT_SECRET is shorter than 32 characters. Use a long random value.");
}

if (process.env.NODE_ENV === "production" && !process.env.FIELD_ENCRYPTION_KEY) {
  console.error("FIELD_ENCRYPTION_KEY is required in production (encrypts member health / ID data at rest)");
  process.exit(1);
}
connectDB();
require("./utils/paymentSaga").startRefundSweep(); // keeps retrying refunds for paid-but-unprovisioned subscriptions

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

// Browsers may only call the API from the gym web app (set CLIENT_URL / FRONTEND_URL / CORS_ORIGINS,
// comma separated). Requests without an Origin header (mobile app, curl, server-to-server) are unaffected.
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:8081", "http://localhost:5173", "http://localhost:3000"]),
]
  .map((o) => (o || "").trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-CSRF-Token",
      "X-Captcha-Token",
      "X-Requested-With",
    ],
  }),
);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

// Broad per-IP ceiling only: every sensitive auth route has its own tighter limiter in routes/authRoutes.js.
// (A gym's staff often share one wifi IP, so this must not be tiny.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again later.",
  },
});

app.use("/api/", generalLimiter);

// Razorpay webhooks need the RAW body for signature checks, so mount before express.json().
// Razorpay "payment captured" notices for plan purchases (see utils/paymentReconcile.js); raw body for the signature
app.post("/api/webhooks/razorpay-billing", express.raw({ type: "*/*", limit: "1mb" }), require("./utils/paymentReconcile").webhook);
app.use(
  "/api/webhooks/razorpay/:tenantId",
  express.raw({ type: "*/*", limit: "1mb" }),
  require("./utils/razorpayWebhook"),
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
const su = require("./utils/signedUploads");
app.use(su.signResponses, su.stripRequest);
// Uploads are photos/PDFs only: never let the browser sniff or run them as a page.
app.use(
  "/uploads",
  su.verifyUpload,
  require("express").static(require("path").join(__dirname, "uploads"), {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

app.use(mongoSanitize({ allowDots: true }));
app.use(hpp());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Usage/health metrics for the CRM dashboard (page views, active users, crashes, API success).
const tele = require("./utils/telemetry")("NESTGYM_SECRET");
app.use(tele.middleware);
app.use("/api/telemetry", tele.ingest);
app.use("/api/crm/metrics", tele.metrics);
app.use("/api/crm/accounts", require("./utils/crmAccounts")("NESTGYM_SECRET", require("./utils/crmAdapter")));

// Domain association files so iOS / Android trust this domain for passkeys (see PASSKEY_RP_ID).
app.get("/.well-known/apple-app-site-association", (req, res) =>
  res.json({ webcredentials: { apps: (process.env.APPLE_APP_ID || "").split(",").map((x) => x.trim()).filter(Boolean) } }),
);
app.get("/.well-known/assetlinks.json", (req, res) =>
  res.json([
    {
      relation: ["delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: process.env.ANDROID_PACKAGE || "com.nestgym",
        sha256_cert_fingerprints: (process.env.ANDROID_SHA256 || "").split(",").map((x) => x.trim()).filter(Boolean),
      },
    },
  ]),
);

app.use("/api/auth", authLimiter, require("./routes/authRoutes"));
app.use("/api/legal", require("./routes/legalRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/branches", require("./routes/branchRoutes"));
app.use("/api/members", require("./routes/memberRoutes"));
app.use("/api/privacy", require("./routes/privacyRoutes"));
app.use("/api/autopay", require("./routes/autopayRoutes"));
app.use("/api/reminders", require("./routes/reminderRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes"));
app.use("/api/trash", require("./routes/trashRoutes"));
app.use("/api/membership-plans", require("./routes/membershipPlanRoutes"));
app.use("/api/memberships", require("./routes/membershipRoutes"));
app.use("/api/invoices", require("./routes/invoiceRoutes"));
app.use("/api/trainers", require("./routes/trainerRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/settings", require("./routes/settingRoutes"));
app.use("/api/activity", require("./routes/activityRoutes"));
app.use("/api/api-keys", require("./routes/apiKeyRoutes"));
app.use("/api/billing", require("./routes/billingRoutes"));
app.use("/api/credits", require("./routes/creditsRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/portal", require("./routes/portalRoutes"));
app.use("/api/pay", require("./routes/payRoutes")); // public, token-authenticated
app.use("/api/payment-links", require("./routes/paymentLinkRoutes"));
app.use("/api", require("./routes/gymRoutes"));

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "NestGym API" });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  require("./utils/paymentLinkJob").startPaymentLinkJob();
  require("./utils/reminders").startReminderJob();
  if (process.env.NODE_ENV === "development") {
    console.log(`NestGym API running on port ${PORT}`);
  }
});

// Daily housekeeping: expire/unfreeze memberships, close forgotten check-ins.
// ponytail: in-process timer, fine for one API instance; move to a cron/queue when scaling out.
const { runSweep } = require("./utils/gym");
setTimeout(
  () => runSweep().catch((e) => console.error("[sweep]", e.message)),
  15 * 1000,
);
setInterval(
  () => runSweep().catch((e) => console.error("[sweep]", e.message)),
  60 * 60 * 1000,
);

module.exports = app;
