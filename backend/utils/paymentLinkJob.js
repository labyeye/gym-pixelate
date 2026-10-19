const Setting = require("../models/Setting");
const { runWithTenant } = require("./tenantScope");
const { sendDue } = require("./paymentLinks");

// Monthly reminders: every few hours check each gym with online payments on; sendDue() itself only
// sends once per invoice per month, so running often is harmless.
// ponytail: in-process timer — does not run on serverless (Vercel); call POST /api/payment-links/send-now
// or hit this from a real cron there. Turn off with PAYLINK_AUTO_SEND=false.
async function runOnce() {
  const gyms = await Setting.find({ onlinePaymentsEnabled: true }).select("tenantId").lean();
  for (const g of gyms) {
    try {
      const s = await runWithTenant(g.tenantId, () => sendDue(g.tenantId));
      if (s.sent || s.failed) console.log(`[paylinks] ${g.tenantId}`, s);
    } catch (e) {
      console.error("[paylinks]", g.tenantId, e.message);
    }
  }
}

function startPaymentLinkJob() {
  if (process.env.VERCEL || process.env.PAYLINK_AUTO_SEND === "false") return;
  if (!process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN) return; // nothing to send with
  setTimeout(runOnce, 60 * 1000).unref();
  setInterval(runOnce, 6 * 60 * 60 * 1000).unref();
}

module.exports = { startPaymentLinkJob, runOnce };
