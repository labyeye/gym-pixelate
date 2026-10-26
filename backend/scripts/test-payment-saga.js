// node scripts/test-payment-saga.js  (no DB: models are stubbed)
const assert = require("assert");
const PaymentIncident = require("../models/PaymentIncident");
const saga = require("../utils/paymentSaga");

const saved = [];
PaymentIncident.findOne = async () => null;
PaymentIncident.prototype.save = async function () { saved.push(this); return this; };

const fakeModel = (name, log) => ({
  modelName: name,
  create: async (d) => ({ _id: name + "1", ...d }),
  deleteOne: async (f) => log.push("deleteOne " + name + " " + f._id),
});

(async () => {
  // 1. rollback undoes newest first
  const log = [];
  const s = new saga.Saga();
  await s.create(fakeModel("Company", log), {});
  await s.create(fakeModel("Invoice", log), {});
  assert.deepStrictEqual(await s.rollback(), ["delete Invoice", "delete Company"]);
  assert.deepStrictEqual(log, ["deleteOne Invoice Invoice1", "deleteOne Company Company1"]);

  // 2. refund succeeds -> customer is told it is on the way
  const refunds = [];
  saga._setClient({ payments: { fetch: async () => ({ amount: 600000 }), refund: async (id, b) => (refunds.push([id, b.amount]), { id: "rfnd_1" }) } });
  await assert.rejects(
    saga.refundAfterFailure({ gateway: "razorpay", paymentId: "pay_1", amount: 6000, product: "this product" }, new Error("invoice failed"), ["delete Company"]),
    (e) => e instanceof saga.PaymentRefundError && /automatic refund of ₹6,000/.test(e.message) && e.status === 409,
  );
  assert.deepStrictEqual(refunds, [["pay_1", 600000]]);
  assert.strictEqual(saved.at(-1).status, "refund_initiated");

  // 3. refund API down -> queued, message says we will process it
  saga._setClient({ payments: { fetch: async () => ({}), refund: async () => { throw new Error("gateway timeout"); } } });
  await assert.rejects(
    saga.refundAfterFailure({ gateway: "razorpay", paymentId: "pay_2", amount: 6000, product: "this product" }, new Error("x")),
    (e) => /We will process your refund of ₹6,000/.test(e.message),
  );
  assert.strictEqual(saved.at(-1).status, "refund_pending");
  assert.strictEqual(saved.at(-1).attempts, 1);

  console.log("payment saga OK");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
