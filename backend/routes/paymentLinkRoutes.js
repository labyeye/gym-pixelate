const express = require("express");
const asyncHandler = require("express-async-handler");
const Invoice = require("../models/Invoice");
const Member = require("../models/Member");
const links = require("../utils/paymentLinks");
const { fail } = require("../utils/gym");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");
const router = express.Router();

router.use(protect, checkPermission("Invoices", "create"));

// Staff: get (and create if needed) the pay link for one invoice, plus a ready-to-send message.
router.post("/invoice/:id", asyncHandler(async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw fail(404, "Invoice not found");
  const member = inv.memberId && (await Member.findById(inv.memberId).select("name phone"));
  const link = await links.ensureLink(req.user.tenantId, inv);
  res.json({
    success: true,
    data: { url: links.linkUrl(link.token), phone: member?.phone, message: await links.shareMessage(req.user.tenantId, inv, member, link) },
  });
}));

// Staff: send this month's WhatsApp reminders for every outstanding invoice now.
router.post("/send-now", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await links.sendDue(req.user.tenantId) });
}));

module.exports = router;
