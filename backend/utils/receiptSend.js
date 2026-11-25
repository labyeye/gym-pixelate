const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const Setting = require("../models/Setting");
const Tenant = require("../models/Tenant");
const NotificationLog = require("../models/NotificationLog");
const { runWithTenant } = require("./tenantScope");
const { parsePhone } = require("./phone");
const { sendPlatformTemplate } = require("./whatsappOtp");
const { buildReceiptPdf } = require("./receiptPdf");

/*
 * After a payment, WhatsApp the member a PDF receipt (the same cheque-style receipt as "Download receipt").
 * Opt-in: Settings > WhatsApp > "Payment receipt" (and the master WhatsApp switch). Needs env
 *   WHATSAPP_RECEIPT_TEMPLATE  - approved template, HEADER = DOCUMENT, BODY = 5 text params:
 *     {{1}} member name  {{2}} gym name  {{3}} amount paid  {{4}} receipt no  {{5}} balance due
 * Costs the gym one utility message of WhatsApp credits. One message per payment row (deduped by NotificationLog).
 */
const inr = (n) =>
  "Rs. " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

async function sendReceipt(tenantId, invoiceId) {
  const template = process.env.WHATSAPP_RECEIPT_TEMPLATE;
  if (!template) return "skip";
  return runWithTenant(tenantId, async () => {
    const s = await Setting.findOne({ tenantId }).lean();
    if (!s || s.whatsappEnabled === false || !s.reminders?.receipt)
      return "skip";
    const inv = await Invoice.findById(invoiceId);
    if (!inv || !inv.memberId) return "skip"; // walk-in sale: nobody to message
    const member = await Member.findById(inv.memberId).select(
      "name memberCode phone whatsappOptIn erasedAt",
    );
    const phone =
      member &&
      member.whatsappOptIn !== false &&
      !member.erasedAt &&
      parsePhone(member.phone);
    if (!phone) return "skip";
    const pays = (inv.payments || []).filter((p) => p.type !== "refund");
    const last = pays[pays.length - 1];
    if (!last) return "skip";
    const refKey = `receipt:${inv._id}:${last._id}`;
    try {
      await NotificationLog.create({
        tenantId,
        memberId: member._id,
        kind: "receipt",
        refKey,
      });
    } catch (e) {
      if (e.code === 11000) return "skip";
      throw e;
    }
    try {
      const gym =
        s.companyName ||
        (await Tenant.findById(tenantId).select("name").lean())?.name ||
        "your gym";
      const pdf = await buildReceiptPdf({
        invoice: inv,
        member,
        setting: s,
        gymName: gym,
      });
      await sendPlatformTemplate(
        phone.e164,
        template,
        [
          member.name,
          gym,
          inr(last.amount),
          inv.invoiceNumber,
          inr(Math.max(0, inv.totalAmount - inv.paidAmount)),
        ],
        process.env.WHATSAPP_RECEIPT_TEMPLATE_LANG || "en",
        { tenantId, kind: "receipt" },
        {
          buffer: pdf,
          filename: `Receipt_${String(inv.invoiceNumber).replace(/[^\w-]/g, "_")}.pdf`,
        },
      );
      await NotificationLog.updateOne({ tenantId, refKey }, { status: "sent" });
      return "sent";
    } catch (err) {
      if (err.code === "NO_CREDITS")
        await NotificationLog.deleteOne({ tenantId, refKey });
      else
        await NotificationLog.updateOne(
          { tenantId, refKey },
          { status: "failed", error: String(err.message).slice(0, 300) },
        );
      return "failed";
    }
  });
}

module.exports = { sendReceipt };
