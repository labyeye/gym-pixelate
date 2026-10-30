// WhatsApp credits on a THROWAWAY in-memory database, Meta/Razorpay/email mocked:  node scripts/check-credits.js
// Needs a real mongod (memory server) because the point is that parallel sends cannot overspend.
const assert = require("assert");
const path = require("path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// no real Razorpay / email in a check
let orderSeq = 0;
const stub = (id, exports) => {
  const p = require.resolve(id);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
process.env.RAZORPAY_KEY_ID = "rzp_test_x";
process.env.RAZORPAY_KEY_SECRET = "secret";
stub("razorpay", function Razorpay() {
  this.orders = { create: async () => ({ id: `order_${++orderSeq}` }) };
});
const mails = [];
stub(path.resolve(__dirname, "..", "utils", "emailService.js"), { sendLowCreditsEmail: async (m) => mails.push(m) });
process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN = "t";
process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = "p";
process.env.WHATSAPP_REMINDER_EXPIRING_TEMPLATE = "t_exp";
process.env.WHATSAPP_REMINDER_EXPIRED_TEMPLATE = "t_expd";
process.env.WHATSAPP_REMINDER_BIRTHDAY_TEMPLATE = "t_bday";

const oid = () => new mongoose.Types.ObjectId();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mongod = await MongoMemoryServer.create();
  mongoose.plugin(require("../utils/tenantScope").tenantScopePlugin); // same as server.js: scoped queries
  await mongoose.connect(mongod.getUri("credits_check"));

  const credits = require("../utils/credits");
  const CreditWallet = require("../models/CreditWallet");
  const CreditLedger = require("../models/CreditLedger");
  const CreditTopup = require("../models/CreditTopup");
  await Promise.all([CreditWallet.init(), CreditLedger.init(), CreditTopup.init()]);

  // 1. no wallet = not metered = free
  const free = oid();
  assert.deepStrictEqual(await credits.reserve(free, { kind: "expiring", phone: "919876543210" }), { ok: true, free: true });

  // 2. 20 parallel sends on 1 credit at 0.2 each: exactly 5 get through, balance never negative
  const c = oid();
  await credits.enable(c);
  await CreditWallet.updateOne({ tenantId: c }, { $set: { balance: credits.toUnits(1) } });
  const holds = await Promise.all(Array.from({ length: 20 }, () => credits.reserve(c, { kind: "expiring", phone: "919876543210" })));
  const okHolds = holds.filter((h) => h.ok);
  assert.strictEqual(okHolds.length, 5, "only 5 of 20 may be charged");
  assert.strictEqual((await CreditWallet.findOne({ tenantId: c })).balance, 0);
  assert.strictEqual(await CreditLedger.countDocuments({ tenantId: c, type: "skipped" }), 15, "skipped sends are logged");

  // 3. refund gives the credit back exactly once
  assert.strictEqual(await credits.refund(okHolds[0]), true);
  assert.strictEqual(await credits.refund(okHolds[0]), false, "second refund is a no-op");
  assert.strictEqual((await credits.getBalance(c)).total, 0.2);

  // 4. message id remembered, refund by id once
  const h = await credits.reserve(c, { kind: "expiring", phone: "919876543210" });
  await credits.commit(h, "wamid.ABC");
  assert.strictEqual(await credits.refundByWamid("wamid.ABC"), true);
  assert.strictEqual(await credits.refundByWamid("wamid.ABC"), false);
  assert.strictEqual((await credits.getBalance(c)).total, 0.2);

  // 5. bonus: idempotent, spent first, expires
  assert.strictEqual(await credits.grantBonus(c, { credits: 1, refId: "x:1" }), true);
  assert.strictEqual(await credits.grantBonus(c, { credits: 1, refId: "x:1" }), false, "same refId never pays twice");
  const r = await credits.reserve(c, { kind: "expiring", phone: "919876543210" });
  assert.strictEqual((await CreditLedger.findById(r.ledgerId)).bucket, "bonus", "bonus is spent first");
  await CreditWallet.updateOne({ tenantId: c }, { $set: { bonusExpiresAt: new Date(Date.now() - 1000) } });
  assert.strictEqual((await credits.getBalance(c)).bonus, 0, "expired bonus does not count");

  // 5b. welcome credits: 1000, once per gym, however many payments
  const bz = oid();
  await credits.enable(bz);
  await credits.onSubscriptionPaid(bz);
  await credits.onSubscriptionPaid(bz);
  assert.strictEqual((await credits.getBalance(bz)).bonus, 1000, "welcome credits granted once");

  // 6. top-up: webhook and browser verify race, credited once; platform-wide invoice numbers
  const t = oid();
  await credits.enable(t);
  const order = await credits.createTopup({ _id: oid(), tenantId: t }, "p1000");
  assert.strictEqual(order.pack.total, 1180, "Rs 1000 + 18% GST");
  const results = await Promise.all([
    credits.completeTopup({ orderId: order.orderId, paymentId: "pay_1" }),
    credits.completeTopup({ orderId: order.orderId, paymentId: "pay_1" }),
  ]);
  assert.strictEqual(results.filter(Boolean).length, 1, "exactly one caller credits the wallet");
  assert.strictEqual((await credits.getBalance(t)).total, 1000);
  assert.match((await CreditTopup.findOne({ orderId: order.orderId })).invoiceNumber, /^CR-GYM-\d{4}$/);
  const t2 = oid();
  await credits.enable(t2);
  const o2 = await credits.createTopup({ _id: oid(), tenantId: t2 }, "p500");
  assert.strictEqual((await credits.completeTopup({ orderId: o2.orderId, paymentId: "pay_2" })).invoiceNumber, "CR-GYM-0002", "numbers continue across gyms");
  await assert.rejects(credits.createTopup({ _id: oid(), tenantId: free }, "p1000"), /not enabled/, "unmetered gym cannot top up");
  await assert.rejects(credits.createTopup({ _id: oid(), tenantId: t }, "nope"), /Unknown/);

  // 7. daily cap stops a runaway loop
  const d = oid();
  await credits.enable(d);
  await CreditWallet.updateOne({ tenantId: d }, { $set: { balance: credits.toUnits(100), dailyCap: 3 } });
  const capped = await Promise.all(Array.from({ length: 6 }, () => credits.reserve(d, { kind: "expiring", phone: "919876543210" })));
  assert.strictEqual(capped.filter((x) => x.ok).length, 3);
  assert.strictEqual(capped.find((x) => !x.ok).reason, "daily_cap");

  // 8. low-balance email: one per level
  const l = oid();
  await mongoose.connection.collection("tenants").insertOne({ _id: l, name: "Iron Gym", email: "owner@iron.test" });
  await credits.enable(l);
  await CreditWallet.updateOne({ tenantId: l }, { $set: { balance: credits.toUnits(50.2) } });
  await credits.reserve(l, { kind: "expiring", phone: "919876543210" }); // exactly 50: not low yet
  await sleep(150);
  assert.strictEqual(mails.length, 0);
  await credits.reserve(l, { kind: "expiring", phone: "919876543210" });
  await credits.reserve(l, { kind: "expiring", phone: "919876543210" });
  await sleep(150);
  assert.strictEqual(mails.length, 1, "one 'low' email, not one per message");

  // 9. end to end through reminders + sendPlatformTemplate, Meta stubbed
  const sent = [];
  let metaOk = true;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (metaOk) sent.push(body.template.name);
    return { ok: metaOk, json: async () => (metaOk ? { messages: [{ id: `wamid.${sent.length}` }] } : { error: { message: "rejected" } }) };
  };
  const rem = require("../utils/reminders");
  const wa = require("../utils/whatsappOtp");
  const Member = require("../models/Member");
  const Membership = require("../models/Membership");
  const NotificationLog = require("../models/NotificationLog");
  const g = oid();
  const branchId = oid(), planId = oid();
  const day = 86400000, now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600000);
  const mk = (name, phone, extra = {}) => Member.collection.insertOne({ _id: oid(), tenantId: g, branchId, name, phone, status: "active", ...extra });
  const ms = (memberId, status, endDate) => Membership.collection.insertOne({ _id: oid(), tenantId: g, branchId, memberId, planId, startDate: new Date(now - 30 * day), endDate, status });
  const a = (await mk("Asha", "9876500001")).insertedId;
  const cc = (await mk("Chitra", "9876500003")).insertedId;
  const b = (await mk("Bela", "9876500002")).insertedId;
  await mk("Dev", "9876500004", { dob: new Date(Date.UTC(1990, ist.getUTCMonth(), ist.getUTCDate())) });
  await ms(a, "active", new Date(now.getTime() + 2 * day));
  await ms(cc, "active", new Date(now.getTime() + 1 * day));
  await ms(b, "expired", new Date(now.getTime() - 1 * day));

  await credits.enable(g);
  await CreditWallet.updateOne({ tenantId: g }, { $set: { balance: credits.toUnits(1.5) } });
  const s = { tenantId: g, companyName: "Iron Gym", reminders: { expiring: true, expired: true, birthday: true } };
  const bal = async () => (await credits.getBalance(g)).total;

  // 1.5 credits: two expiring (0.2 each) + one expired (0.2) = 0.6 -> 0.9 left, then the birthday (1.0) does not fit
  await assert.rejects(rem.runForGym(s), (e) => e.code === "NO_CREDITS");
  assert.deepStrictEqual(sent.sort(), ["t_exp", "t_exp", "t_expd"], "the three affordable reminders went out");
  assert.strictEqual(await bal(), 0.9);
  assert.strictEqual(await NotificationLog.countDocuments({ tenantId: g, kind: "birthday" }), 0, "unsent birthday is not marked as done");
  assert.strictEqual((await CreditLedger.findOne({ tenantId: g, type: "skipped" })).note, "low_balance");

  // after a top-up the same run sends only what is still missing, and the birthday costs more
  await CreditWallet.updateOne({ tenantId: g }, { $inc: { balance: credits.toUnits(1) } });
  const r2 = await rem.runForGym(s);
  assert.strictEqual(r2.sent, 1, "only the birthday is left to send");
  assert.strictEqual(await bal(), 0.9, "1.9 - 1.0 for the promotional template");

  // Meta rejecting a send gives the credit back, and a payment link is charged like a reminder
  metaOk = false;
  await assert.rejects(wa.sendPlatformTemplate("919876543210", "x", ["a"], "en", { tenantId: g, kind: "payment_link" }), /rejected/);
  assert.strictEqual(await bal(), 0.9, "rejected send is refunded");
  metaOk = true;
  await wa.sendPlatformTemplate("919876543210", "x", ["a"], "en", { tenantId: g, kind: "payment_link" });
  assert.strictEqual(await bal(), 0.7, "payment link costs 0.2");

  // a message with no `charge` (OTP etc.) never touches the wallet
  const ledgerBefore = await CreditLedger.countDocuments({});
  await CreditWallet.updateOne({ tenantId: g }, { $set: { balance: 0, bonusBalance: 0 } });
  await wa.sendWhatsAppOtp("919876543210", "123456");
  await wa.sendPlatformTemplate("919876543210", "x", ["a"]);
  assert.strictEqual(await CreditLedger.countDocuments({}), ledgerBefore, "OTP / platform messages never create a ledger row");

  console.log("credits checks passed");
  await mongoose.disconnect();
  await mongod.stop();
})().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
