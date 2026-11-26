// GET /api/crm/invoices[?status=paid] : every paid SaaS invoice across all gyms, for the CRM dashboard.
// Guarded by the same x-api-key secret as /api/crm/accounts. Amounts are rupees, GST included.
const crypto = require("crypto");
const express = require("express");
const Subscription = require("../models/Subscription");
const Tenant = require("../models/Tenant");
const User = require("../models/User");

module.exports = (secretEnv) => {
  const router = express.Router();
  router.use((req, res, next) => {
    const secret = process.env[secretEnv] || "";
    const a = Buffer.from(String(req.headers["x-api-key"] || ""));
    const b = Buffer.from(secret);
    if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(401).json({ success: false, message: "Unauthorized" });
    next();
  });
  router.get("/", async (req, res) => {
    const subs = await Subscription.find({ "invoices.0": { $exists: true } })
      .select("tenant invoices")
      .lean();
    const tenants = await Tenant.find({ _id: { $in: subs.map((s) => s.tenant) } })
      .select("name email ownerUser")
      .lean();
    const owners = await User.find({ _id: { $in: tenants.map((t) => t.ownerUser) } })
      .select("email")
      .lean();
    const email = Object.fromEntries(owners.map((o) => [String(o._id), o.email]));
    const byId = Object.fromEntries(tenants.map((t) => [String(t._id), t]));
    const invoices = subs
      .flatMap((s) =>
        s.invoices.map((i) => {
          const t = byId[String(s.tenant)];
          return {
            invoiceNumber: i.invoiceNumber || "—",
            clientName: t?.name || "(deleted gym)",
            clientEmail: t?.email || email[String(t?.ownerUser)] || "",
            amount: Math.round(i.amount || 0) / 100,
            gst: i.gstAmount != null ? i.gstAmount / 100 : undefined,
            currency: "INR",
            status: i.status,
            issuedDate: i.paidAt,
            dueDate: i.paidAt,
            subscriptionPlan: i.plan,
          };
        }),
      )
      .filter((i) => !req.query.status || i.status === req.query.status)
      .sort((a, b) => new Date(b.issuedDate) - new Date(a.issuedDate));
    res.json({ success: true, invoices });
  });
  return router;
};
