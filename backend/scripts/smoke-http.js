// End-to-end HTTP smoke test on a THROWAWAY in-memory database (never touches a real DB).
//   node scripts/smoke-http.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("gymsmoke");
  process.env.JWT_SECRET = "smoke-secret";
  process.env.ENCRYPTION_SECRET = "smoke-enc-secret";
  process.env.PORT = "5099";
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "http://localhost:8081";
  require("../server");
  await new Promise((r) => setTimeout(r, 1500));

  const base = "http://127.0.0.1:5099/api";
  let token = "";
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { ...json, status: res.status };
  };
  const step = async (name, fn) => {
    try {
      await fn();
      console.log("  ok   ", name);
    } catch (e) {
      console.log("  FAIL ", name, "\n        ", e.message);
      process.exitCode = 1;
    }
  };

  await step("health is public (gym routes don't swallow it)", async () => {
    assert.strictEqual((await call("GET", "/health")).status, 200);
  });

  let a, b;
  await step("register two gyms", async () => {
    a = await call("POST", "/auth/register", {
      name: "Alpha Owner",
      email: "alpha@fit.gym",
      password: "Kx7#mQv29!",
      companyName: "Alpha Fitness",
    });
    assert.strictEqual(a.status, 201, JSON.stringify(a));
    b = await call("POST", "/auth/register", {
      name: "Bravo Owner",
      email: "bravo@fit.gym",
      password: "Kx7#mQv29!",
      companyName: "Bravo Fitness",
    });
    assert.strictEqual(b.status, 201, JSON.stringify(b));
    // every login must accept the Terms once before the API works (utils/terms.js)
    for (const who of [a, b]) {
      token = who.data.token;
      assert.strictEqual((await call("POST", "/legal/accept", {})).status, 200);
    }
  });

  let plan, member, sale;
  token = a?.data?.token;
  await step(
    "plan + member created WITHOUT sending branchId (auto Main Branch)",
    async () => {
      const p = await call("POST", "/membership-plans", {
        name: "Monthly",
        type: "monthly",
        durationDays: 30,
        price: 1500,
        gstPercent: 18,
        admissionFee: 500,
        freezeAllowedDays: 7,
      });
      assert.strictEqual(p.status, 201, JSON.stringify(p));
      plan = p.data;
      const m = await call("POST", "/members", {
        name: "Ravi Kumar",
        phone: "9876543210",
      });
      assert.strictEqual(m.status, 201, JSON.stringify(m));
      member = m.data;
      assert.ok(/^GYM-\d{5}$/.test(member.memberCode));
      assert.ok(member.branchId);
    },
  );
  await step("sell membership with part payment, collect balance", async () => {
    sale = await call("POST", "/memberships", {
      memberId: member._id,
      planId: plan._id,
      payNow: 1000,
      method: "upi",
    });
    assert.strictEqual(sale.status, 201, JSON.stringify(sale));
    assert.strictEqual(sale.invoice.totalAmount, 2360); // (1500+500)*1.18
    const pay = await call("POST", `/invoices/${sale.invoice._id}/payments`, {
      amount: 1360,
      method: "cash",
    });
    assert.strictEqual(pay.data.status, "paid");
  });
  await step("dashboard + reports respond", async () => {
    const s = await call("GET", "/dashboard/summary");
    assert.strictEqual(s.data.todayRevenue, 2360);
    assert.strictEqual((await call("GET", "/reports/overview")).status, 200);
    assert.strictEqual(
      (await call("GET", "/reports/renewals?days=7")).status,
      200,
    );
    assert.strictEqual((await call("GET", "/dashboard/charts")).status, 200);
  });
  await step(
    "generic resources: class, product, expense",
    async () => {
      assert.strictEqual(
        (
          await call("POST", "/classes", {
            name: "Zumba",
            capacity: 10,
            schedule: [{ day: 1, start: "18:00" }],
          })
        ).status,
        201,
      );
      assert.strictEqual(
        (
          await call("POST", "/products", {
            name: "Whey",
            price: 2000,
            stock: 5,
          })
        ).status,
        201,
      );
      assert.strictEqual(
        (await call("POST", "/expenses", { category: "rent", amount: 5000 }))
          .status,
        201,
      );
      assert.strictEqual((await call("GET", "/classes/sessions")).status, 200);
    },
  );
  await step("billing plans are gym plans", async () => {
    const p = await call("GET", "/billing/plans");
    assert.deepStrictEqual(Object.keys(p.data), [
      "starter",
      "growth",
      "pro",
      "elite",
      "enterprise",
    ]);
    assert.strictEqual(p.data.starter.priceMonthly, 79900);
  });

  token = b?.data?.token;
  await step("gym B cannot see or touch gym A's data", async () => {
    assert.strictEqual(
      (await call("GET", `/members/${member._id}`)).status,
      404,
    );
    assert.strictEqual(
      (await call("GET", `/invoices/${sale.invoice._id}`)).status,
      404,
    );
    assert.strictEqual(
      (
        await call("POST", `/invoices/${sale.invoice._id}/payments`, {
          amount: 1,
        })
      ).status,
      404,
    );
    assert.strictEqual(
      (await call("GET", `/members/${member._id}/overview`)).status,
      404,
    );
    assert.strictEqual((await call("GET", "/members")).data.length, 0);
    assert.strictEqual(
      (
        await call("POST", "/memberships", {
          memberId: member._id,
          planId: plan._id,
        })
      ).status,
      404,
    );
    const own = await call("POST", "/invoices", {
      items: [{ description: "Day pass", unitPrice: 200, gstPercent: 18 }],
    });
    assert.strictEqual(
      own.data.invoiceNumber,
      "INV-00001",
      "B's numbering starts at 1 independent of A",
    );
  });

  await step("CORS: only the gym web app origin is allowed", async () => {
    const hit = (origin) =>
      fetch(base + "/health", { headers: { Origin: origin } }).then((r) =>
        r.headers.get("access-control-allow-origin"),
      );
    assert.strictEqual(await hit("http://localhost:8081"), "http://localhost:8081");
    assert.strictEqual(await hit("https://evil.example"), null);
  });

  await step("upload: a fake photo is rejected by its real bytes", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }), "x.jpg");
    const res = await fetch(base + "/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    assert.strictEqual(res.status, 400);
  });

  await step("changing the password signs out older sessions", async () => {
    const old = token;
    await new Promise((r) => setTimeout(r, 2500)); // iat is whole seconds; the check allows 2s slack
    const res = await call("PUT", "/auth/change-password", {
      currentPassword: "Kx7#mQv29!",
      newPassword: "Zq4#Lm82Rt!v",
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res));
    const fresh = res.data.token;
    token = old;
    assert.strictEqual((await call("GET", "/auth/me")).status, 401, "old token must stop working");
    token = fresh;
    assert.strictEqual((await call("GET", "/auth/me")).status, 200, "new token works");
  });

  await step("Razorpay webhook: signed event books the invoice once", async () => {
    const crypto = require("crypto");
    const settings = await call("PUT", "/settings", { razorpayWebhookSecret: "whsec_test" });
    assert.strictEqual(settings.status, 200, JSON.stringify(settings));
    assert.strictEqual(settings.data.razorpayWebhookSecretSaved, true);
    assert.strictEqual(settings.data.razorpayWebhookSecretEnc, undefined, "secret never returned");
    const tenantId = settings.data.tenantId;
    const inv = await call("POST", "/invoices", {
      items: [{ description: "Month", unitPrice: 1000, gstPercent: 0 }],
      payNow: 0, // without this the legacy default marks it paid in full
    });
    assert.strictEqual(inv.status, 201, JSON.stringify(inv));
    assert.strictEqual(inv.data.status, "pending", "starts unpaid");
    const body = JSON.stringify({
      event: "payment.captured",
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: { id: "pay_TEST1", status: "captured", amount: 100000, notes: { invoiceId: inv.data._id } },
        },
      },
    });
    const send = (raw, sig) =>
      fetch(`${base}/webhooks/razorpay/${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Razorpay-Signature": sig },
        body: raw,
      });
    const good = crypto.createHmac("sha256", "whsec_test").update(body).digest("hex");
    assert.strictEqual((await send(body, "deadbeef")).status, 400, "bad signature rejected");
    assert.strictEqual((await send(body, good)).status, 200);
    assert.strictEqual((await send(body, good)).status, 200, "replay is acknowledged");
    const after = await call("GET", `/invoices/${inv.data._id}`);
    assert.strictEqual(after.data.status, "paid");
    assert.strictEqual(after.data.payments.length, 1, "a replay must not double-book");
  });

  // ── account security: verification, reset methods, 2FA, sessions ──────────
  const speakeasy = require("speakeasy");
  const User = require("../models/User");
  const { hashOtp } = require("../utils/otpTools");
  const crypto = require("crypto");
  const EMAIL = "bravo@fit.gym";
  const PHONE = "+919876501234";
  let pw = "Zq4#Lm82Rt!v";
  const plant = (set) => User.updateOne({ email: EMAIL }, set);
  const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
  const in10 = () => new Date(Date.now() + 600000);
  const signIn = async (password = pw) => {
    token = "";
    const r = await call("POST", "/auth/login", { email: EMAIL, password });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    return r;
  };

  await step("verify phone with a WhatsApp code", async () => {
    token = (await signIn()).data.token;
    assert.strictEqual((await call("PUT", "/auth/me", { phone: PHONE })).status, 200);
    assert.strictEqual((await call("GET", "/auth/me")).data.phoneVerified, false, "new number starts unverified");
    await plant({ phoneVerifyOtp: hashOtp("111222"), phoneVerifyOtpExpire: in10(), phoneVerifyOtpTries: 0 });
    assert.strictEqual((await call("POST", "/auth/phone/verify-otp", { otp: "000000" })).status, 400);
    assert.strictEqual((await call("POST", "/auth/phone/verify-otp", { otp: "111222" })).status, 200);
    assert.strictEqual((await call("GET", "/auth/me")).data.phoneVerified, true);
    // changing the number resets the proof
    assert.strictEqual((await call("PUT", "/auth/me", { phone: "+919876509999" })).status, 200);
    assert.strictEqual((await call("GET", "/auth/me")).data.phoneVerified, false);
    await call("PUT", "/auth/me", { phone: PHONE });
    await plant({ phoneVerified: true });
  });

  await step("verify email with a code", async () => {
    await plant({ pendingEmail: EMAIL, contactOtp: hashOtp("333444"), contactOtpExpire: in10(), contactOtpTries: 0 });
    assert.strictEqual((await call("POST", "/auth/contact/email/verify-otp", { otp: "999999" })).status, 400);
    assert.strictEqual((await call("POST", "/auth/contact/email/verify-otp", { otp: "333444" })).status, 200);
    assert.strictEqual((await call("GET", "/auth/me")).data.emailVerified, true);
  });

  await step("forgot password: methods + WhatsApp code reset (single use, strong password)", async () => {
    token = "";
    const m = await call("GET", `/auth/forgot-password/methods?email=${EMAIL}`);
    assert.deepStrictEqual(m.data.methods, ["email", "whatsapp", "totp", "backup", "passkey"], "same list for every address");
    await plant({ resetOtp: hashOtp("555666"), resetOtpExpire: in10(), resetOtpTries: 0 });
    const body = (password, otp = "555666") => ({ email: EMAIL, otp, password });
    assert.strictEqual((await call("POST", "/auth/reset-password/otp", body("weakpass"))).status, 400, "weak password");
    assert.strictEqual((await call("POST", "/auth/reset-password/otp", body("Fresh#Pass1", "000000"))).status, 400, "wrong code");
    const okReset = await call("POST", "/auth/reset-password/otp", body("Fresh#Pass1"));
    assert.strictEqual(okReset.status, 200, JSON.stringify(okReset));
    assert.strictEqual((await call("POST", "/auth/reset-password/otp", body("Other#Pass1"))).status, 400, "code is single use");
    pw = "Fresh#Pass1";
    await signIn();
  });

  await step("forgot password: emailed link works once", async () => {
    await plant({ resetPasswordToken: sha("linktoken"), resetPasswordExpire: in10() });
    assert.strictEqual((await call("POST", "/auth/reset-password/linktoken", { password: "nope" })).status, 400);
    assert.strictEqual((await call("POST", "/auth/reset-password/linktoken", { password: "Linked#Pass1" })).status, 200);
    assert.strictEqual((await call("POST", "/auth/reset-password/linktoken", { password: "Again#Pass1" })).status, 400, "link is single use");
    pw = "Linked#Pass1";
    await signIn();
  });

  await step("email code sign-in", async () => {
    token = "";
    await plant({ emailLoginOtp: hashOtp("777888"), emailLoginOtpExpire: in10(), emailLoginOtpTries: 0 });
    assert.strictEqual((await call("POST", "/auth/login/email-otp/verify", { email: EMAIL, otp: "000000" })).status, 401);
    const ok = await call("POST", "/auth/login/email-otp/verify", { email: EMAIL, otp: "777888" });
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.data.token);
  });

  let backup;
  await step("2FA: setup, confirm, login needs the code, backup code works once", async () => {
    token = (await signIn()).data.token;
    const setup = await call("POST", "/auth/2fa/setup");
    assert.strictEqual(setup.status, 200);
    assert.ok(setup.data.qr.startsWith("data:image/png"));
    const totp = () => speakeasy.totp({ secret: setup.data.secret, encoding: "base32" });
    assert.strictEqual((await call("POST", "/auth/2fa/confirm", { token: "000000" })).status, 400);
    const confirm = await call("POST", "/auth/2fa/confirm", { token: totp() });
    assert.strictEqual(confirm.status, 200, JSON.stringify(confirm));
    assert.strictEqual(confirm.data.backupCodes.length, 10);
    backup = confirm.data.backupCodes;

    token = "";
    const first = await call("POST", "/auth/login", { email: EMAIL, password: pw });
    assert.strictEqual(first.data.requires2FA, true);
    assert.strictEqual(first.data.token, undefined, "password alone gives no session");
    token = first.data.pendingToken;
    assert.strictEqual((await call("GET", "/auth/me")).status, 401, "pending token is not a session");
    token = "";
    assert.strictEqual((await call("POST", "/auth/2fa/verify", { pendingToken: first.data.pendingToken, token: "000000" })).status, 401);
    const done = await call("POST", "/auth/2fa/verify", { pendingToken: first.data.pendingToken, token: totp() });
    assert.strictEqual(done.status, 200, JSON.stringify(done));
    token = done.data.token;
    assert.strictEqual((await call("GET", "/auth/me")).status, 200);

    token = "";
    const viaBackup = await call("POST", "/auth/login/backup", { email: EMAIL, code: backup[0] });
    assert.strictEqual(viaBackup.status, 200, JSON.stringify(viaBackup));
    assert.strictEqual((await call("POST", "/auth/login/backup", { email: EMAIL, code: backup[0] })).status, 401, "backup code is single use");
    token = viaBackup.data.token;
    assert.strictEqual((await call("GET", "/auth/backup-codes")).data.remaining, 9);
    // turning it off needs password + a code
    assert.strictEqual((await call("POST", "/auth/2fa/disable", { token: totp(), password: "wrong" })).status, 400);
    assert.strictEqual((await call("POST", "/auth/2fa/disable", { token: totp(), password: pw })).status, 200);
    assert.strictEqual((await call("GET", "/auth/me")).data.twoFactorEnabled, false);
  });

  await step("insights report runs (churn, cohorts, LTV, trainers)", async () => {
    const r = await call("GET", "/reports/insights");
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.ok(Array.isArray(r.data.churn) && Array.isArray(r.data.cohorts) && r.data.ltv && Array.isArray(r.data.trainers));
  });

  await step("devices: list, sign out another, sign out current", async () => {
    const a = (await signIn()).data.token;
    const b2 = (await signIn()).data.token;
    token = b2;
    const list = await call("GET", "/auth/sessions");
    assert.ok(list.data.length >= 2);
    assert.strictEqual(list.data.filter((s) => s.current).length, 1);
    assert.strictEqual((await call("DELETE", "/auth/sessions/others")).status, 200);
    token = a;
    assert.strictEqual((await call("GET", "/auth/me")).status, 401, "other device was signed out");
    token = b2;
    const me = await call("GET", "/auth/sessions");
    assert.strictEqual(me.data.length, 1);
    assert.strictEqual((await call("DELETE", `/auth/sessions/${me.data[0]._id}`)).status, 200);
    assert.strictEqual((await call("GET", "/auth/me")).status, 401, "current device signed out");
  });

  console.log(process.exitCode ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
  await mongod.stop();
  process.exit(process.exitCode || 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
