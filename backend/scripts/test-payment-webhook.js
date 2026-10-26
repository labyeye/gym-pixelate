// node scripts/test-payment-webhook.js  (in-memory MongoDB: webhook -> reconcile activates or refunds an unverified payment)
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
const assert = require("assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const Tenant = require("../models/Tenant");
  const Subscription = require("../models/Subscription");
  const PaymentEvent = require("../models/PaymentEvent");
  const PaymentIncident = require("../models/PaymentIncident");
  const saga = require("../utils/paymentSaga");
  const { webhook, reconcile } = require("../utils/paymentReconcile");
  const refunds = [];
  saga._setClient({ payments: { fetch: async () => ({}), refund: async (id, b) => (refunds.push([id, b.amount]), { id: "rfnd_1" }) } });

  const mk = async (slug, plan, orderId) => {
    const t = await Tenant.create({ name: slug, slug, ownerUser: new mongoose.Types.ObjectId(), email: `${slug}@x.test`, phone: "9999999999", plan: "trial" });
    await Subscription.create({ tenant: t._id, status: "active", pendingOrder: { razorpayOrderId: orderId, plan, billingCycle: "monthly", amount: 999 } });
    return t;
  };
  const send = (payload, goodSig = true) => {
    const raw = Buffer.from(JSON.stringify(payload));
    const sig = crypto.createHmac("sha256", goodSig ? "whsec_test" : "nope").update(raw).digest("hex");
    return new Promise((resolve) => {
      const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code || 200, b }); } };
      webhook({ body: raw, get: () => sig }, res);
    });
  };
  const ev = (pid, oid) => ({ event: "payment.captured", payload: { payment: { entity: { id: pid, order_id: oid, amount: 99900 } } } });
  const PLAN = "starter"; // a valid paid plan

  const t1 = await mk("good-gym", PLAN, "order_good");
  const tBad = await mk("bad-gym", PLAN, "order_bad");
  // the database fails halfway through activating this one gym (after its subscription was already written)
  const realUpdate = Tenant.findByIdAndUpdate.bind(Tenant);
  Tenant.findByIdAndUpdate = (id, ...rest) => (String(id) === String(tBad._id) ? Promise.reject(new Error("db went away")) : realUpdate(id, ...rest));

  assert.strictEqual((await send(ev("pay_x", "order_good"), false)).code, 400, "bad signature is rejected");
  assert.strictEqual((await send(ev("pay_other", "order_of_another_product"))).code, 200);
  assert.strictEqual(await PaymentEvent.countDocuments(), 0, "orders of other products are ignored");
  await send(ev("pay_good", "order_good"));
  await send(ev("pay_good", "order_good")); // Razorpay retries: still one event
  await send(ev("pay_bad", "order_bad"));
  assert.strictEqual(await PaymentEvent.countDocuments(), 2);

  await reconcile();
  assert.strictEqual(await PaymentEvent.countDocuments({ status: "pending" }), 2, "nothing is touched in the first minutes (the customer's own verify gets first go)");

  await PaymentEvent.updateMany({}, { $set: { receivedAt: new Date(Date.now() - 10 * 60 * 1000) } });
  await reconcile();
  const sub = await Subscription.findOne({ tenant: t1._id }).lean();
  assert.strictEqual(sub.plan, PLAN, "orphan payment activated the plan");
  assert.strictEqual(sub.invoices.length, 1);
  assert.strictEqual((await Tenant.findById(t1._id)).plan, PLAN);
  assert.strictEqual((await PaymentEvent.findOne({ paymentId: "pay_good" })).note, "activated from webhook");

  const bad = await PaymentEvent.findOne({ paymentId: "pay_bad" });
  assert.match(bad.note, /^refunded/);
  assert.deepStrictEqual(refunds, [["pay_bad", 99900]]);
  assert.strictEqual((await PaymentIncident.findOne({ paymentId: "pay_bad" })).status, "refund_initiated");
  const badSub = await Subscription.findOne({ tenant: tBad._id }).lean();
  assert.ok(badSub.pendingOrder && !(badSub.invoices || []).length, "the half-done activation was undone");

  // running again changes nothing
  await reconcile();
  assert.strictEqual(refunds.length, 1);
  assert.strictEqual((await Subscription.findOne({ tenant: t1._id })).invoices.length, 1);
  console.log("payment webhook OK");
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
