const asyncHandler = require("express-async-handler");
const Member = require("../models/Member");
const WalletLedger = require("../models/WalletLedger");
const wallet = require("../utils/wallet");
const { fail } = require("../utils/gym");
const logActivity = require("../utils/activityLogger");

const member = async (id) => {
  const m = await Member.findById(id).select("name walletBalance");
  if (!m) throw fail(404, "Member not found");
  return m;
};
const log = (req, m, text) =>
  logActivity({ user: req.user, action: "UPDATE", module: "Member", description: `${text} (${m.name})`, targetId: m._id, ip: req.ip });

const get = asyncHandler(async (req, res) => {
  const m = await member(req.params.memberId);
  const rows = await WalletLedger.find({ memberId: m._id }).sort("-createdAt").limit(50);
  res.json({ success: true, data: { balance: m.walletBalance || 0, ledger: rows } });
});

// Manual credit (goodwill, cashback) or debit (correction). Needs a note so the ledger explains itself.
const adjust = asyncHandler(async (req, res) => {
  const m = await member(req.params.memberId);
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || "").trim();
  if (!amount || !note) throw fail(400, "amount and note are required");
  if (amount > 0) await wallet.credit(req.user.tenantId, m._id, amount, "manual", { note, by: req.user._id });
  else await wallet.debit(req.user.tenantId, m._id, -amount, "manual", { note, by: req.user._id });
  log(req, m, `Wallet ${amount > 0 ? "credit" : "debit"} Rs ${Math.abs(amount)}: ${note}`);
  res.json({ success: true, data: { balance: (await member(m._id)).walletBalance } });
});

const apply = asyncHandler(async (req, res) => {
  const m = await member(req.params.memberId);
  const { invoiceId, amount } = req.body || {};
  if (!invoiceId || !(Number(amount) > 0)) throw fail(400, "invoiceId and amount are required");
  const inv = await wallet.applyToInvoice(req.user.tenantId, m._id, invoiceId, Number(amount), req.user._id);
  log(req, m, `Paid Rs ${amount} from wallet on invoice ${inv.invoiceNumber}`);
  res.json({ success: true, data: inv });
});

module.exports = { get, adjust, apply };
