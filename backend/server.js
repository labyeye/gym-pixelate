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

connectDB();

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow the CRM frontend and all origins for the public API
      const allowed = process.env.CLIENT_URL || "http://localhost:8081";
      if (!origin || origin === allowed) return callback(null, true);
      // Public endpoints are called from any website
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-CSRF-Token",
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again later.",
  },
});

app.use("/api/", generalLimiter);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(
  "/uploads",
  require("express").static(require("path").join(__dirname, "uploads")),
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

app.use("/api/auth", authLimiter, require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/branches", require("./routes/branchRoutes"));
app.use("/api/members", require("./routes/memberRoutes"));
app.use("/api/membership-plans", require("./routes/membershipPlanRoutes"));
app.use("/api/memberships", require("./routes/membershipRoutes"));
app.use("/api/invoices", require("./routes/invoiceRoutes"));
app.use("/api/trainers", require("./routes/trainerRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/settings", require("./routes/settingRoutes"));
app.use("/api/activity", require("./routes/activityRoutes"));
app.use("/api/api-keys", require("./routes/apiKeyRoutes"));
app.use("/api/billing", require("./routes/billingRoutes"));
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
