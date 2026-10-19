// End-to-end HTTP smoke test on a THROWAWAY in-memory database (never touches a real DB).
//   node scripts/smoke-http.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("gymsmoke");
  process.env.JWT_SECRET = "smoke-secret";
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
      password: "Passw0rdA!",
      companyName: "Alpha Fitness",
    });
    assert.strictEqual(a.status, 201, JSON.stringify(a));
    b = await call("POST", "/auth/register", {
      name: "Bravo Owner",
      email: "bravo@fit.gym",
      password: "Passw0rdA!",
      companyName: "Bravo Fitness",
    });
    assert.strictEqual(b.status, 201, JSON.stringify(b));
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
  await step("check-in then double check-in conflicts", async () => {
    assert.strictEqual(
      (await call("POST", "/attendance/checkin", { memberId: member._id }))
        .status,
      201,
    );
    assert.strictEqual(
      (await call("POST", "/attendance/checkin", { memberId: member._id }))
        .status,
      409,
    );
    const live = await call("GET", "/attendance/live");
    assert.strictEqual(live.data.insideCount, 1);
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
    "generic resources: enquiry -> convert, class, product, expense",
    async () => {
      const e = await call("POST", "/enquiries", {
        name: "Walk In",
        phone: "9000011111",
        source: "walk_in",
      });
      assert.strictEqual(e.status, 201, JSON.stringify(e));
      const c = await call("POST", `/enquiries/${e.data._id}/convert`, {});
      assert.strictEqual(c.status, 201, JSON.stringify(c));
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

  console.log(process.exitCode ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
  await mongod.stop();
  process.exit(process.exitCode || 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
