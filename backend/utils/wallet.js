const Member = require("../models/Member");
const WalletLedger = require("../models/WalletLedger");
const Setting = require("../models/Setting");
const { fail, r2, recordPayment } = require("./gym");

/** Adds money to a member's wallet. With a refKey it can only ever happen once. Returns false if it already had. */
async function credit(tenantId, memberId, amount, reason, { refKey, note, by, invoiceId } = {}) {
  amount = r2(amount);
  if (!(amount > 0)) throw fail(400, "Amount must be greater than zero");
  try {
    await WalletLedger.create({ tenantId, memberId, amount, reason, refKey, note, by, invoiceId });
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
  await Member.updateOne({ _id: memberId, tenantId }, { $inc: { walletBalance: amount } });
  return true;
}

/** Takes money out; the conditional update means the balance can never go negative, even with two clicks at once. */
async function debit(tenantId, memberId, amount, reason, { note, by, invoiceId } = {}) {
  amount = r2(amount);
  if (!(amount > 0)) throw fail(400, "Amount must be greater than zero");
  const m = await Member.findOneAndUpdate({ _id: memberId, tenantId, walletBalance: { $gte: amount } }, { $inc: { walletBalance: -amount } });
  if (!m) throw fail(400, "Not enough wallet balance");
  return WalletLedger.create({ tenantId, memberId, amount: -amount, reason, note, by, invoiceId });
}

/** Pays (part of) an invoice from the wallet. Money goes back if the invoice refuses it. */
async function applyToInvoice(tenantId, memberId, invoiceId, amount, by) {
  const row = await debit(tenantId, memberId, amount, "redeem", { by, invoiceId, note: "Used on invoice" });
  try {
    return await recordPayment(tenantId, invoiceId, { amount, method: "wallet", reference: String(row._id), idempotencyKey: `wallet:${row._id}`, userId: by });
  } catch (e) {
    await Member.updateOne({ _id: memberId, tenantId }, { $inc: { walletBalance: r2(amount) } });
    await WalletLedger.deleteOne({ _id: row._id });
    throw e;
  }
}

/** First paid plan of a referred member -> the referrer earns the gym's reward (Settings > referralReward). */
async function rewardReferral(tenantId, member) {
  if (!member.referredBy) return;
  const s = await Setting.findOne({ tenantId }).select("referralReward").lean();
  if (!(s?.referralReward > 0)) return;
  await credit(tenantId, member.referredBy, s.referralReward, "referral", { refKey: `referral:${member._id}`, note: `Referred ${member.name}` });
}

module.exports = { credit, debit, applyToInvoice, rewardReferral };
