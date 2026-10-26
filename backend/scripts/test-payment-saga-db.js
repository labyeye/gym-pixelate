// node scripts/test-payment-saga-db.js  (in-memory MongoDB: proves a failed activation is undone and refunded)
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const Tenant = require("../models/Tenant");
  const Subscription = require("../models/Subscription");
  const PaymentIncident = require("../models/PaymentIncident");
  const saga = require("../utils/paymentSaga");

  const refunds = [];
  saga._setClient({ payments: { fetch: async () => ({ amount: 99900 }), refund: async (id, b) => (refunds.push([id, b.amount]), { id: "rfnd_9" }) } });

  const tenant = await Tenant.create({ name: "Iron Gym", slug: "iron-gym", ownerUser: new mongoose.Types.ObjectId(), email: "o@iron.test", phone: "9999999999", plan: "trial" });
  const sub = await Subscription.create({ tenant: tenant._id, plan: "trial", status: "active" });

  // the same steps the billing route runs, with the tenant step failing
  const s = new saga.Saga();
  const beforeSub = sub.toObject();
  s.onRollback("restore subscription", () => Subscription.replaceOne({ _id: sub._id }, beforeSub));
  await Subscription.updateOne({ _id: sub._id }, { $set: { plan: "pro", status: "active" }, $push: { invoices: { invoiceNumber: "B-1", amount: 99900 } } });
  s.amount = 999;
  let thrown;
  try {
    await Tenant.findByIdAndUpdate(tenant._id, { plan: "not-a-plan" }, { runValidators: true });
    throw new Error("tenant update failed");
  } catch (err) {
    const undone = await s.rollback();
    try {
      await saga.refundAfterFailure({ gateway: "razorpay", paymentId: "pay_77", orderId: "order_77", amount: 999, product: "NestGym subscription", ownerId: tenant._id }, err, undone);
    } catch (e) { thrown = e; }
  }

  assert.ok(thrown && thrown.refund, "customer gets the refund message");
  assert.match(thrown.message, /automatic refund of ₹999/);
  const after = await Subscription.findById(sub._id).lean();
  assert.strictEqual(after.plan, "trial", "subscription restored");
  assert.ok(!after.invoices || after.invoices.length === 0, "no half-made bill left behind");
  assert.deepStrictEqual(refunds, [["pay_77", 99900]]);
  const inc = await PaymentIncident.findOne({ paymentId: "pay_77" });
  assert.strictEqual(inc.status, "refund_initiated");
  assert.deepStrictEqual(inc.rolledBack, ["restore subscription"]);

  // a second verify call for the same payment is answered from the incident, no second refund
  await assert.rejects(saga.refundAfterFailure({ gateway: "razorpay", paymentId: "pay_77", amount: 999, product: "x" }, new Error("again")), (e) => e.refund);
  assert.strictEqual(refunds.length, 1);
  console.log("payment saga (db) OK");
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
