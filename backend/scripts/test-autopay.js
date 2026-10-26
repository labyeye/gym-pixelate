// Autopay mandate lifecycle on a THROWAWAY in-memory database, Razorpay calls mocked:  node scripts/test-autopay.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");
const crypto = require("crypto");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("gymautopay");
  process.env.JWT_SECRET = "autopay-secret";
  process.env.ENCRYPTION_SECRET = "autopay-enc";
  process.env.PORT = "5096";
  process.env.NODE_ENV = "test";
  const autopay = require("../utils/autopay");
  let n = 0;
  autopay.rzp.createPlan = async (c, b) => ({ id: "plan_" + ++n, ...b });
  autopay.rzp.createSubscription = async (c, b) => ({ id: "sub_" + n, short_url: "https://rzp.io/i/x" + n, ...b });
  autopay.rzp.cancelSubscription = async () => ({});
  require("../server");
  await new Promise((r) => setTimeout(r, 1500));
  const base = "http://127.0.0.1:5096/api";
  let token = "";
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ...(await res.json().catch(() => ({}))), status: res.status };
  };

  const reg = await call("POST", "/auth/register", { name: "Own Er", email: "o@a.gym", password: "Kx7#mQv29!", companyName: "A Fit" });
  token = reg.data.token;
  const tenantId = reg.data.tenantId;
  await call("POST", "/legal/accept", {});
  assert.strictEqual(
    (await call("PUT", "/settings", { onlinePaymentsEnabled: true, razorpayKeyId: "rzp_test_x", razorpayKeySecret: "sec", razorpayWebhookSecret: "whsec" })).status,
    200,
  );
  const planRes = await call("POST", "/membership-plans", { name: "Monthly", type: "monthly", durationDays: 30, price: 1000, gstPercent: 18, priceIncludesGst: true });
  assert.strictEqual(planRes.status, 201, JSON.stringify(planRes));
  const plan = planRes.data;
  const member = (await call("POST", "/members", { name: "Ravi", phone: "9876543210" })).data;
  const sale = await call("POST", "/memberships", { memberId: member._id, planId: plan._id, payNow: 1000, method: "cash" });
  assert.strictEqual(sale.status, 201, JSON.stringify(sale));

  // odd-length plans are refused
  const odd = (await call("POST", "/membership-plans", { name: "Odd", type: "custom", durationDays: 45, price: 500, gstPercent: 0 })).data;
  const oddSale = await call("POST", "/memberships", { memberId: (await call("POST", "/members", { name: "Z", phone: "9876543211" })).data._id, planId: odd._id, payNow: 500, method: "cash" });
  assert.strictEqual((await call("POST", `/autopay/memberships/${oddSale.data._id}`)).status, 400);

  const en = await call("POST", `/autopay/memberships/${sale.data._id}`);
  assert.strictEqual(en.status, 201, JSON.stringify(en));
  assert.strictEqual(en.data.amount, 1000);
  assert((await call("POST", `/autopay/memberships/${sale.data._id}`)).status === 400, "only one live mandate");

  // signed webhook: charged -> renewal + invoice, replay is a no-op
  const hook = async (event, payment) => {
    const raw = JSON.stringify({ event, created_at: Math.floor(Date.now() / 1000), payload: { subscription: { entity: { id: en.data.razorpaySubscriptionId } }, ...(payment && { payment: { entity: payment } }) } });
    const sig = crypto.createHmac("sha256", "whsec").update(raw).digest("hex");
    const r = await fetch(`${base}/webhooks/razorpay/${tenantId}`, { method: "POST", headers: { "X-Razorpay-Signature": sig, "Content-Type": "application/json" }, body: raw });
    return r.json();
  };
  assert.strictEqual((await hook("subscription.activated")).handled, "active");
  const pay = { id: "pay_1", status: "captured", amount: 100000 };
  assert((await hook("subscription.charged", pay)).handled.startsWith?.("INV"), "charged books an invoice");
  assert.strictEqual((await hook("subscription.charged", pay)).handled, "duplicate");
  const list = await call("GET", `/memberships?memberId=${member._id}`);
  assert.strictEqual(list.data.length, 2, "renewal membership created");
  assert((await call("POST", `/autopay/${en.data._id}/cancel`)).data.status === "cancelled");

  console.log("AUTOPAY OK");
  await mongod.stop();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
