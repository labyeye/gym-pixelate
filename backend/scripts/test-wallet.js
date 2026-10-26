// Referral reward + wallet on a THROWAWAY in-memory database:  node scripts/test-wallet.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("gymwallet");
  process.env.JWT_SECRET = "wallet-secret";
  process.env.ENCRYPTION_SECRET = "wallet-enc";
  process.env.PORT = "5095";
  process.env.NODE_ENV = "test";
  require("../server");
  await new Promise((r) => setTimeout(r, 1500));
  const base = "http://127.0.0.1:5095/api";
  let token = "";
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ...(await res.json().catch(() => ({}))), status: res.status };
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  token = (await call("POST", "/auth/register", { name: "Own Er", email: "o@w.gym", password: "Kx7#mQv29!", companyName: "W Fit" })).data.token;
  await call("POST", "/legal/accept", {});
  await call("PUT", "/settings", { referralReward: 200 });
  const plan = (await call("POST", "/membership-plans", { name: "Monthly", type: "monthly", durationDays: 30, price: 1000, gstPercent: 0 })).data;
  const ravi = (await call("POST", "/members", { name: "Ravi", phone: "9876543210" })).data;
  const sita = (await call("POST", "/members", { name: "Sita", phone: "9876543211", referrerCode: ravi.memberCode, walletBalance: 99999 })).data;
  assert.strictEqual(sita.walletBalance, 0, "client cannot set the wallet");
  assert.strictEqual(String(sita.referredBy), String(ravi._id));

  // referred member's first PAID plan rewards the referrer exactly once
  await call("POST", "/memberships", { memberId: sita._id, planId: plan._id, payNow: 1000, method: "cash" });
  await wait(300);
  let w = await call("GET", `/wallet/${ravi._id}`);
  assert.strictEqual(w.data.balance, 200);
  await call("POST", "/memberships", { memberId: sita._id, planId: plan._id, payNow: 1000, method: "cash" });
  await wait(300);
  assert.strictEqual((await call("GET", `/wallet/${ravi._id}`)).data.balance, 200, "no second reward");

  // spend 150 from the wallet on a due invoice; overspending is refused
  const sale = await call("POST", "/memberships", { memberId: ravi._id, planId: plan._id, payNow: 0 });
  const inv = sale.invoice._id;
  assert.strictEqual((await call("POST", `/wallet/${ravi._id}/apply`, { invoiceId: inv, amount: 500 })).status, 400);
  const ok = await call("POST", `/wallet/${ravi._id}/apply`, { invoiceId: inv, amount: 150 });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok));
  assert.strictEqual(ok.data.paidAmount, 150);
  w = await call("GET", `/wallet/${ravi._id}`);
  assert.strictEqual(w.data.balance, 50);
  assert.strictEqual((await call("POST", `/wallet/${ravi._id}/adjust`, { amount: -80, note: "x" })).status, 400, "cannot go negative");

  console.log("WALLET OK");
  await mongod.stop();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
