// Offline check (models stubbed, no Mongo): 4th wrong password locks 30 min, WhatsApp OTP unlocks.
process.env.JWT_SECRET = "t";
const assert = require("assert");
const Module = require("module");
let sent;
const users = [];
const mk = (o) =>
  Object.assign(
    {
      status: "active",
      failedLogins: 0,
      save: async () => {},
      matchPassword: async (p) => p === "right",
    },
    o,
  );
const q = (r) => {
  const p = Promise.resolve(r);
  p.select = () => p;
  return p;
};
const stubs = {
  "../models/User": {
    findOne: (f) =>
      q(
        f.email
          ? users.find((u) => u.email === f.email)
          : users.find((u) => f.phone.$in.includes(u.phone) && u.loginOtpHash),
      ),
    find: (f) => q(users.filter((u) => f.phone.$in.includes(u.phone))),
    updateOne: async (f, u) => {
      const t = users.find((x) => x._id === f._id);
      if (u.$inc) for (const k in u.$inc) t[k] = (t[k] || 0) + u.$inc[k];
      Object.assign(t, u.$set || {});
      for (const k in u.$unset || {}) delete t[k];
    },
  },
  "../models/Tenant": { findById: () => q(null) },
  "../utils/activityLogger": () => {},
  "../utils/whatsappOtp": {
    sendWhatsAppOtp: async (_p, code) => {
      sent = code;
    },
  },
};
const orig = Module._load;
Module._load = function (r, ...a) {
  return stubs[r] || orig.call(this, r, ...a);
};
const c = require("../controllers/authController");
const call = async (fn, body) => {
  const res = {
    code: 200,
    status(n) {
      this.code = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  try {
    await fn({ body, ip: "1" }, res, (e) => {
      res.err = e;
    });
  } catch (e) {
    res.err = e;
  }
  return res;
};
(async () => {
  const u = mk({ _id: "1", email: "a@b.co", phone: "9876543210", name: "A" });
  users.push(u);
  for (let i = 0; i < 3; i++)
    assert.strictEqual(
      (await call(c.login, { email: "a@b.co", password: "bad" })).code,
      401,
    );
  assert.strictEqual(
    (await call(c.login, { email: "a@b.co", password: "bad" })).code,
    429,
    "4th wrong locks",
  );
  assert.ok(Math.abs(u.lockUntil - Date.now() - 30 * 60 * 1000) < 5000);
  assert.strictEqual(
    (await call(c.login, { email: "a@b.co", password: "right" })).code,
    429,
    "locked even with right password",
  );
  await call(c.sendOtp, { phone: "9876543210" });
  assert.strictEqual(
    (await call(c.verifyOtp, { phone: "9876543210", otp: "000000" })).code,
    401,
  );
  assert.strictEqual(
    (await call(c.verifyOtp, { phone: "9876543210", otp: sent })).code,
    200,
    "OTP signs in while locked",
  );
  assert.strictEqual(
    (await call(c.login, { email: "a@b.co", password: "right" })).code,
    200,
    "lock lifted",
  );
  console.log("login lock checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
