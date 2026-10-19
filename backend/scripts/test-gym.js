// Integration tests for the NestGym refactor. Runs against an IN-MEMORY MongoDB — never touches a real database.
//   node scripts/test-gym.js
process.env.JWT_SECRET = "test-secret";
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { tenantScopePlugin, runWithTenant } = require("../utils/tenantScope");
mongoose.plugin(tenantScopePlugin);

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push([true, name]);
    console.log("  ok   ", name);
  } catch (e) {
    results.push([false, name]);
    console.log(
      "  FAIL ",
      name,
      "\n        ",
      (e.stack || String(e)).split("\n").slice(0, 4).join("\n         "),
    );
  }
};
const rejects = async (p, status, re) => {
  try {
    await p;
  } catch (e) {
    if (e.name === "ValidationError") e.status = 400;
    if (status)
      assert.strictEqual(e.status, status, `status ${e.status}: ${e.message}`);
    if (re) assert.ok(re.test(e.message), e.message);
    return e;
  }
  assert.fail("expected rejection");
};

// Runs a controller inside a tenant context, like `protect` does.
const call = (fn, user, req = {}) =>
  new Promise((resolve) => {
    runWithTenant(user.tenantId, async () => {
      const res = {
        code: 200,
        status(c) {
          this.code = c;
          return this;
        },
        json(b) {
          this.body = b;
          resolve(this);
          return this;
        },
      };
      try {
        await fn(
          { params: {}, query: {}, body: {}, ip: "1.1.1.1", user, ...req },
          res,
          (e) => resolve({ err: e, code: e.status || res.code }),
        );
      } catch (e) {
        resolve({ err: e, code: e.status || 500 });
      }
    });
  });
const ok = async (fn, user, req) => {
  const r = await call(fn, user, req);
  if (r.err) throw r.err;
  return r.body;
};

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("gymtest"));
  const M = (n) => require(`../models/${n}`);
  const [
    Tenant,
    User,
    Branch,
    Member,
    Plan,
    Membership,
    Invoice,
    Coupon,
    Product,
    Counter,
  ] = [
    "Tenant",
    "User",
    "Branch",
    "Member",
    "MembershipPlan",
    "Membership",
    "Invoice",
    "Coupon",
    "Product",
    "Counter",
  ].map(M);
  const G = require("../utils/gym");
  const MS = require("../controllers/membershipController");
  const INV = require("../controllers/invoiceController");
  const CLS = require("../controllers/classController");
  const PT = require("../controllers/ptController");
  const OPS = require("../controllers/opsController");
  const REP = require("../controllers/reportController");
  const MEM = require("../controllers/memberController");
  const Subscription = M("Subscription");

  const mkGym = async (label) => {
    const owner = await User.create({
      name: `${label} Owner`,
      email: `${label}@gym.test`,
      password: "Passw0rdA",
      role: "gym_owner",
    });
    const t = await Tenant.create({
      name: label,
      slug: label.toLowerCase(),
      ownerUser: owner._id,
      plan: "growth",
    });
    owner.tenantId = t._id;
    await owner.save({ validateBeforeSave: false });
    const branch = await Branch.create({ tenantId: t._id, name: "Main" });
    const trainer = await User.create({
      name: `${label} Trainer`,
      email: `${label}.t@gym.test`,
      password: "Passw0rdA",
      role: "trainer",
      tenantId: t._id,
      branchId: branch._id,
    });
    const monthly = await Plan.create({
      tenantId: t._id,
      name: "Monthly",
      type: "monthly",
      durationDays: 30,
      price: 1000,
      gstPercent: 18,
      admissionFee: 500,
      freezeAllowedDays: 10,
      maxFreezes: 1,
      includes: { classes: true },
    });
    const annual = await Plan.create({
      tenantId: t._id,
      name: "Annual",
      type: "annual",
      durationDays: 365,
      price: 9000,
      gstPercent: 18,
    });
    return { t, owner, branch, trainer, monthly, annual, tid: t._id };
  };
  const A = await mkGym("Alpha");
  const B = await mkGym("Bravo");
  const mkMember = (g, name, phone) =>
    ok(MEM.createMember, g.owner, {
      body: { name, phone, branchId: g.branch._id },
    }).then((r) => r.data);

  console.log("\nTenant isolation");
  await test("a gym can't read another gym's records by id (IDOR fix)", async () => {
    const ma = await mkMember(A, "Asha", "9000000001");
    const mb = await mkMember(B, "Bala", "9000000002");
    const r = await call(MEM.getMember, A.owner, {
      params: { id: String(mb._id) },
    });
    assert.strictEqual(r.code, 404, "other tenant's member must be invisible");
    assert.ok(
      (await ok(MEM.getMember, A.owner, { params: { id: String(ma._id) } }))
        .data,
    );
    const del = await call(MEM.deleteMember, A.owner, {
      params: { id: String(mb._id) },
    });
    assert.strictEqual(del.code, 404);
    assert.ok(await Member.findById(mb._id), "B's member untouched");
  });
  await test("a body can't move a record to another gym; branch is auto-filled and validated", async () => {
    const PC = require("../controllers/membershipPlanController");
    await ok(PC.updatePlan, A.owner, {
      params: { id: String(A.annual._id) },
      body: { tenantId: B.tid, name: "Annual Plus" },
    });
    const p = await Plan.collection.findOne({ _id: A.annual._id });
    assert.strictEqual(String(p.tenantId), String(A.tid));
    assert.strictEqual(p.name, "Annual Plus");
    const req = { user: A.owner, method: "POST", body: {} };
    await runWithTenant(A.tid, () => G.ensureBranch(req));
    assert.strictEqual(String(req.body.branchId), String(A.branch._id));
    const evil = {
      user: A.owner,
      method: "POST",
      body: { branchId: B.branch._id },
    };
    await rejects(
      runWithTenant(A.tid, () => G.ensureBranch(evil)),
      400,
      /Unknown branch/,
    );
    const fresh = await User.create({
      name: "No Branch Gym",
      email: "nb@gym.test",
      password: "Passw0rdA",
      role: "gym_owner",
    });
    const t2 = await Tenant.create({
      name: "NB",
      slug: "nb",
      ownerUser: fresh._id,
    });
    fresh.tenantId = t2._id;
    const r2 = { user: fresh, method: "POST", body: {} };
    await runWithTenant(t2._id, () => G.ensureBranch(r2));
    assert.ok(r2.body.branchId, "a Main Branch was created");
    assert.strictEqual(
      (await Branch.findById(r2.body.branchId)).name,
      "Main Branch",
    );
  });
  await test("member codes and invoice numbers are per tenant", async () => {
    const a2 = await mkMember(A, "Arun", "9000000011");
    const b2 = await mkMember(B, "Bina", "9000000012");
    assert.ok(/^GYM-\d{5}$/.test(a2.memberCode));
    assert.strictEqual(a2.memberCode, "GYM-00002");
    assert.strictEqual(b2.memberCode, "GYM-00002");
    const ia = await G.createInvoice({
      tenantId: A.tid,
      branchId: A.branch._id,
      items: [{ description: "x", unitPrice: 100, gstPercent: 0 }],
      payFull: true,
    });
    const ib = await G.createInvoice({
      tenantId: B.tid,
      branchId: B.branch._id,
      items: [{ description: "x", unitPrice: 100, gstPercent: 0 }],
      payFull: true,
    });
    assert.strictEqual(
      ia.invoiceNumber,
      ib.invoiceNumber,
      "same number in two gyms must not collide",
    );
  });

  console.log("\nMembers");
  await test("duplicate member (same name + phone) is rejected; no code is burned on failure", async () => {
    const m = await mkMember(A, "Dup Person", "9111111111");
    const before = (await Counter.findOne({ tenantId: A.tid, key: "member" }))
      .seq;
    await rejects(
      ok(MEM.createMember, A.owner, {
        body: {
          name: "dup person",
          phone: "9111111111",
          branchId: A.branch._id,
        },
      }),
      409,
    );
    await rejects(
      ok(MEM.createMember, A.owner, {
        body: { phone: "9222222222", branchId: A.branch._id },
      }),
      400,
    ); // name missing -> validation
    assert.strictEqual(
      (await Counter.findOne({ tenantId: A.tid, key: "member" })).seq,
      before,
      "counter unchanged by failures",
    );
    assert.ok(m._id);
  });
  await test("client can't overwrite tenantId / memberCode on update", async () => {
    const m = await mkMember(A, "Guarded", "9333333333");
    await ok(MEM.updateMember, A.owner, {
      params: { id: String(m._id) },
      body: { tenantId: B.tid, memberCode: "HACK", city: "Pune" },
    });
    const f = await Member.findById(m._id);
    assert.strictEqual(String(f.tenantId), String(A.tid));
    assert.strictEqual(f.memberCode, m.memberCode);
    assert.strictEqual(f.city, "Pune");
  });
  await test("SaaS plan member cap is enforced", async () => {
    const C = await mkGym("Charlie");
    await Tenant.updateOne({ _id: C.tid }, { plan: "trial" });
    const old = Subscription.PLAN_LIMITS.trial.members;
    Subscription.PLAN_LIMITS.trial.members = 2;
    try {
      await mkMember(C, "One", "9400000001");
      await mkMember(C, "Two", "9400000002");
      const e = await rejects(
        ok(MEM.createMember, C.owner, {
          body: { name: "Three", phone: "9400000003", branchId: C.branch._id },
        }),
        403,
        /allows 2 members/,
      );
      assert.strictEqual(e.code, "PLAN_LIMIT");
    } finally {
      Subscription.PLAN_LIMITS.trial.members = old;
    }
  });

  console.log("\nSelling memberships & billing");
  let asha;
  await test("sale: GST maths, admission fee on first plan, part-payment leaves dues", async () => {
    asha = await mkMember(A, "Asha Verma", "9500000001");
    const r = await ok(MS.createMembership, A.owner, {
      body: {
        memberId: asha._id,
        planId: A.monthly._id,
        payNow: 600,
        method: "upi",
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });
    // 1000 + 500 admission = 1500; GST 18% = 270; total 1770
    assert.strictEqual(r.invoice.totalAmount, 1770);
    assert.strictEqual(r.invoice.gstAmount, 270);
    assert.strictEqual(r.invoice.status, "partial");
    assert.strictEqual(r.invoice.paidAmount, 600);
    assert.strictEqual(r.data.status, "active");
    assert.strictEqual(r.data.dueAmount, 1170);
    assert.strictEqual(r.invoice.items.length, 2);
  });
  await test("collecting the rest closes the invoice; overpay and replays are refused", async () => {
    const inv = await Invoice.findOne({ tenantId: A.tid, status: "partial" });
    await rejects(
      ok(INV.addPayment, A.owner, {
        params: { id: String(inv._id) },
        body: { amount: 5000 },
      }),
      400,
      /more than the balance/,
    );
    const k = "pay-1";
    await ok(INV.addPayment, A.owner, {
      params: { id: String(inv._id) },
      body: { amount: 500, idempotencyKey: k },
    });
    await ok(INV.addPayment, A.owner, {
      params: { id: String(inv._id) },
      body: { amount: 500, idempotencyKey: k },
    }); // double-click
    let f = await Invoice.findById(inv._id);
    assert.strictEqual(f.paidAmount, 1100, "retry with same key applied once");
    await ok(INV.addPayment, A.owner, {
      params: { id: String(inv._id) },
      body: { amount: 670, method: "cash" },
    });
    f = await Invoice.findById(inv._id);
    assert.strictEqual(f.status, "paid");
    assert.strictEqual(
      (await Membership.findById(f.membershipId)).paidAmount,
      1770,
      "membership dues follow the invoice",
    );
    await rejects(
      ok(INV.addPayment, A.owner, {
        params: { id: String(inv._id) },
        body: { amount: 1 },
      }),
      409,
    );
  });
  await test("sell is idempotent with the same key (no double membership / invoice)", async () => {
    const m = await mkMember(A, "Idem Potent", "9500000002");
    const body = {
      memberId: m._id,
      planId: A.annual._id,
      payNow: 0,
      idempotencyKey: "sale-xyz",
    };
    const r1 = await ok(MS.createMembership, A.owner, { body });
    const r2 = await ok(MS.createMembership, A.owner, { body });
    assert.strictEqual(String(r1.data._id), String(r2.data._id));
    assert.strictEqual(await Membership.countDocuments({ memberId: m._id }), 1);
  });
  await test("coupon: percent discount with cap, usage limit is atomic", async () => {
    await Coupon.create({
      tenantId: A.tid,
      code: "NEW20",
      type: "percent",
      value: 20,
      maxDiscount: 150,
      usageLimit: 1,
    });
    const m1 = await mkMember(A, "Coup One", "9500000003");
    const m2 = await mkMember(A, "Coup Two", "9500000004");
    const r = await ok(MS.createMembership, A.owner, {
      body: {
        memberId: m1._id,
        planId: A.monthly._id,
        couponCode: "new20",
        includeAdmission: false,
        payNow: 0,
      },
    });
    assert.strictEqual(
      r.invoice.discount,
      150,
      "20% of 1000 = 200, capped at 150",
    );
    assert.strictEqual(r.invoice.totalAmount, r2x((1000 - 150) * 1.18));
    await rejects(
      ok(MS.createMembership, A.owner, {
        body: {
          memberId: m2._id,
          planId: A.monthly._id,
          couponCode: "NEW20",
          payNow: 0,
        },
      }),
      409,
      /fully used/,
    );
    assert.strictEqual(
      await Membership.countDocuments({ memberId: m2._id }),
      0,
      "failed sale leaves nothing behind",
    );
  });
  await test("renewal queues after the running membership instead of overlapping", async () => {
    const cur = await Membership.findOne({ memberId: asha._id });
    const r = await ok(MS.renewMembership, A.owner, {
      params: { id: String(cur._id) },
      body: { payNow: 1180 },
    });
    assert.strictEqual(r.data.status, "upcoming");
    assert.strictEqual(+r.data.startDate, +cur.endDate);
    assert.strictEqual(r.data.isRenewal, true);
    assert.strictEqual(
      r.invoice.items.length,
      1,
      "no admission fee on renewal",
    );
  });
  await test("freeze: limits enforced, end date extended, early unfreeze hands days back", async () => {
    const m = await mkMember(A, "Freezer", "9500000005");
    const { data } = await ok(MS.createMembership, A.owner, {
      body: { memberId: m._id, planId: A.monthly._id, payNow: 1770 },
    });
    await rejects(
      ok(MS.freezeMembership, A.owner, {
        params: { id: String(data._id) },
        body: { days: 30 },
      }),
      400,
      /freeze day/,
    );
    const f = await ok(MS.freezeMembership, A.owner, {
      params: { id: String(data._id) },
      body: { days: 10 },
    });
    assert.strictEqual(f.data.status, "frozen");
    assert.strictEqual(
      Math.round((f.data.endDate - data.endDate) / 86400000),
      10,
    );
    await rejects(
      ok(MS.freezeMembership, A.owner, {
        params: { id: String(data._id) },
        body: { days: 1 },
      }),
      409,
      /active membership/,
    );
    const u = await ok(MS.unfreezeMembership, A.owner, {
      params: { id: String(data._id) },
    });
    assert.strictEqual(u.data.status, "active");
    assert.strictEqual(u.data.freezeDaysUsed, 1, "only 1 day actually used");
    assert.ok(
      Math.abs((u.data.endDate - data.endDate) / 86400000 - 1) < 0.01,
      "end date = original + 1 day",
    );
  });
  await test("upgrade credits the unused part; cancel + refund moves money out via the ledger", async () => {
    const m = await mkMember(A, "Upgrader", "9500000006");
    const { data } = await ok(MS.createMembership, A.owner, {
      body: { memberId: m._id, planId: A.monthly._id, payNow: 1770 },
    });
    const up = await ok(MS.upgradeMembership, A.owner, {
      params: { id: String(data._id) },
      body: { planId: A.annual._id },
    });
    assert.ok(up.credit > 900 && up.credit <= 1000, `credit ${up.credit}`);
    assert.strictEqual(
      (await Membership.findById(data._id)).status,
      "upgraded",
    );
    assert.strictEqual(up.invoice.discount, up.credit);
    const cx = await ok(MS.cancelMembership, A.owner, {
      params: { id: String(up.data._id) },
      body: { reason: "moving city", refundAmount: 0 },
    });
    assert.strictEqual(cx.data.status, "cancelled");
    await rejects(
      ok(MS.cancelMembership, A.owner, {
        params: { id: String(up.data._id) },
        body: {},
      }),
      409,
    );
    // refund path
    const m2 = await mkMember(A, "Refundee", "9500000007");
    const s = await ok(MS.createMembership, A.owner, {
      body: { memberId: m2._id, planId: A.monthly._id, payNow: 1770 },
    });
    await rejects(
      ok(MS.cancelMembership, A.owner, {
        params: { id: String(s.data._id) },
        body: { refundAmount: 99999 },
      }),
      409,
    );
  });
  await test("a membership with payments can't be deleted; invoice with payments can't be deleted", async () => {
    const m = await Membership.findOne({
      tenantId: A.tid,
      paidAmount: { $gt: 0 },
    });
    await rejects(
      ok(MS.deleteMembership, A.owner, { params: { id: String(m._id) } }),
      409,
    );
    const inv = await Invoice.findOne({
      tenantId: A.tid,
      paidAmount: { $gt: 0 },
    });
    await rejects(
      ok(INV.deleteInvoice, A.owner, { params: { id: String(inv._id) } }),
      409,
    );
  });

  console.log("\nClasses, PT, POS");
  await test("class booking: capacity, waitlist, auto-promotion on cancel, unscheduled slot refused", async () => {
    const GymClass = M("GymClass");
    const when = new Date(Date.now() + 3 * 86400000);
    when.setMinutes(0, 0, 0);
    const local = new Date(when.getTime() + 5.5 * 3600000);
    const cls = await GymClass.create({
      tenantId: A.tid,
      branchId: A.branch._id,
      name: "Zumba",
      capacity: 2,
      schedule: [
        { day: local.getUTCDay(), start: local.toISOString().slice(11, 16) },
      ],
    });
    const people = [];
    for (let i = 0; i < 3; i++) {
      const m = await mkMember(A, `Zumba Fan ${i}`, `97000000${i}0`);
      await ok(MS.createMembership, A.owner, {
        body: { memberId: m._id, planId: A.monthly._id, payNow: 1770 },
      });
      people.push(m);
    }
    const b0 = await ok(CLS.bookClass, A.owner, {
      body: { classId: cls._id, memberId: people[0]._id, sessionDate: when },
    });
    await ok(CLS.bookClass, A.owner, {
      body: { classId: cls._id, memberId: people[1]._id, sessionDate: when },
    });
    const b2 = await ok(CLS.bookClass, A.owner, {
      body: { classId: cls._id, memberId: people[2]._id, sessionDate: when },
    });
    assert.strictEqual(b2.waitlisted, true);
    await rejects(
      ok(CLS.bookClass, A.owner, {
        body: { classId: cls._id, memberId: people[0]._id, sessionDate: when },
      }),
      409,
      /Already booked/,
    );
    const c = await ok(CLS.cancelBooking, A.owner, {
      params: { id: String(b0.data._id) },
    });
    assert.strictEqual(
      String(c.promoted.memberId),
      String(people[2]._id),
      "waitlisted member got the seat",
    );
    await rejects(
      ok(CLS.bookClass, A.owner, {
        body: {
          classId: cls._id,
          memberId: people[0]._id,
          sessionDate: new Date(when.getTime() + 3600000),
        },
      }),
      400,
      /does not run/,
    );
  });
  await test("PT: package billed, trainer can't be double-booked, completion consumes a session once, commission is per delivered session", async () => {
    const m = await mkMember(A, "PT Client", "9800000001");
    const r = await ok(PT.createPackage, A.owner, {
      body: {
        memberId: m._id,
        trainerId: A.trainer._id,
        totalSessions: 3,
        pricePerSession: 500,
        commissionPercent: 40,
        payNow: 1000,
        name: "PT 3",
      },
    });
    assert.strictEqual(r.invoice.totalAmount, 1770);
    const at = new Date(Date.now() + 86400000);
    const s1 = await ok(PT.scheduleSession, A.owner, {
      params: { id: String(r.data._id) },
      body: { scheduledAt: at },
    });
    await rejects(
      ok(PT.scheduleSession, A.owner, {
        params: { id: String(r.data._id) },
        body: { scheduledAt: new Date(+at + 30 * 60000) },
      }),
      409,
      /already has a session/,
    );
    const sid = s1.data.sessions[0]._id;
    const done = await ok(PT.updateSession, A.owner, {
      params: { id: String(r.data._id), sessionId: String(sid) },
      body: { status: "completed" },
    });
    assert.strictEqual(done.data.remainingSessions, 2);
    await rejects(
      ok(PT.updateSession, A.owner, {
        params: { id: String(r.data._id), sessionId: String(sid) },
        body: { status: "completed" },
      }),
      409,
    );
    const rep = await ok(PT.commissionReport, A.owner, {});
    const row = rep.data.find((x) => x.trainer === "Alpha Trainer");
    assert.strictEqual(row.sessions, 1);
    assert.strictEqual(row.commission, 200);
  });
  await test("POS: stock decremented, insufficient stock rolls the whole sale back", async () => {
    const whey = await Product.create({
      tenantId: A.tid,
      branchId: A.branch._id,
      name: "Whey 1kg",
      price: 2000,
      gstPercent: 18,
      stock: 3,
    });
    const bar = await Product.create({
      tenantId: A.tid,
      branchId: A.branch._id,
      name: "Protein bar",
      price: 100,
      gstPercent: 12,
      stock: 1,
    });
    const sale = await ok(OPS.sell, A.owner, {
      body: {
        branchId: A.branch._id,
        lines: [{ productId: whey._id, quantity: 2 }],
        method: "cash",
      },
    });
    assert.strictEqual(sale.data.totalAmount, 4720);
    assert.strictEqual(sale.data.status, "paid");
    assert.strictEqual((await Product.findById(whey._id)).stock, 1);
    await rejects(
      ok(OPS.sell, A.owner, {
        body: {
          branchId: A.branch._id,
          lines: [
            { productId: whey._id, quantity: 1 },
            { productId: bar._id, quantity: 5 },
          ],
        },
      }),
      409,
      /Only 1 of Protein bar/,
    );
    assert.strictEqual(
      (await Product.findById(whey._id)).stock,
      1,
      "first line was put back",
    );
  });
  await test("staff can't create accounts above their own level", async () => {
    const UC = require("../controllers/userController");
    const mgr = await User.create({
      name: "Mgr",
      email: "mgr@alpha.test",
      password: "Passw0rdA",
      role: "branch_manager",
      tenantId: A.tid,
    });
    await rejects(
      ok(UC.createUser, mgr, {
        body: {
          name: "Evil",
          email: "evil@alpha.test",
          password: "Passw0rdA",
          role: "gym_owner",
        },
      }),
      403,
    );
    await rejects(
      ok(UC.createUser, A.owner, {
        body: {
          name: "Evil",
          email: "evil2@alpha.test",
          password: "Passw0rdA",
          role: "super_admin",
        },
      }),
      403,
    );
    const good = await ok(UC.createUser, mgr, {
      body: {
        name: "Desk 2",
        email: "desk2@alpha.test",
        password: "Passw0rdA",
        role: "receptionist",
      },
    });
    assert.ok(/^EMP-\d{3}$/.test(good.data.employeeId));
  });

  console.log("\nReports");
  await test("dashboard + overview read from the payment ledger; refunds reduce income; dues roll up", async () => {
    const C = await mkGym("Delta");
    const m = await ok(MEM.createMember, C.owner, {
      body: { name: "Rep", phone: "9990000001", branchId: C.branch._id },
    }).then((r) => r.data);
    const s = await ok(MS.createMembership, C.owner, {
      body: {
        memberId: m._id,
        planId: C.monthly._id,
        payNow: 1000,
        includeAdmission: false,
      },
    }); // total 1180
    await ok(INV.refund, C.owner, {
      params: { id: String(s.invoice._id) },
      body: { amount: 200 },
    });
    const sum = await ok(REP.getDashboardSummary, C.owner);
    assert.strictEqual(
      sum.data.todayRevenue,
      800,
      "1000 collected - 200 refunded",
    );
    assert.strictEqual(
      sum.data.pendingPayments,
      380,
      "1180 - 800 still unpaid after refund",
    );
    const ov = await ok(REP.overview, C.owner);
    assert.strictEqual(ov.data.income, 800);
    await ok(require("../utils/crud").crud(M("Expense")).create, C.owner, {
      body: { category: "rent", amount: 300, branchId: C.branch._id },
    });
    assert.strictEqual((await ok(REP.overview, C.owner)).data.profit, 500);
    const d = await ok(REP.dues, C.owner);
    assert.strictEqual(d.total, 380);
    assert.strictEqual(d.data[0].member.name, "Rep");
    // other gym's numbers are not mixed in
    assert.strictEqual(
      (await ok(REP.getDashboardSummary, A.owner)).data.todayRevenue !== 800,
      true,
    );
    const ch = await ok(REP.getDashboardCharts, C.owner);
    assert.strictEqual(ch.data.revenueByDay.length, 30);
    assert.strictEqual(ch.data.revenueByDay.at(-1).revenue, 800);
  });
  await test("renewals worklist lists who is about to lapse with a WhatsApp link", async () => {
    const C = await Tenant.findOne({ slug: "delta" });
    const owner = await User.findOne({ email: "Delta@gym.test".toLowerCase() });
    const ms = await Membership.findOne({ tenantId: C._id });
    await Membership.updateOne(
      { _id: ms._id },
      { $set: { endDate: new Date(Date.now() + 3 * 86400000) } },
    );
    const r = await ok(REP.renewals, owner, { query: { days: "7" } });
    assert.strictEqual(r.count, 1);
    assert.ok(r.data[0].whatsapp.startsWith("https://wa.me/919990000001"));
  });

  console.log("\nStaff attendance & payroll");
  await test("attendance is pro-rated, half days count 0.5, trainer commission added, other gyms isolated", async () => {
    const ST = require("../controllers/staffController");
    const P = require("../models/PTPackage");
    const desk = await User.create({
      name: "Payroll Desk",
      email: "pr.desk@alpha.test",
      password: "Passw0rdA",
      role: "receptionist",
      tenantId: A.tid,
      monthlySalary: 30000,
    });
    await User.updateOne({ _id: A.trainer._id }, { monthlySalary: 20000 });
    const month = "2026-09"; // 30 days
    const day = (d) => `${month}-${String(d).padStart(2, "0")}`;
    for (let d = 1; d <= 20; d++)
      await ok(ST.mark, A.owner, {
        body: { userId: desk._id, date: day(d), status: "present" },
      });
    await ok(ST.mark, A.owner, {
      body: { userId: desk._id, date: day(21), status: "half_day" },
    });
    await ok(ST.mark, A.owner, {
      body: { userId: desk._id, date: day(22), status: "absent" },
    });
    await ok(ST.mark, A.owner, {
      body: { userId: desk._id, date: day(21), status: "present" },
    }); // re-mark = update, not a duplicate
    assert.strictEqual(
      await require("../models/StaffAttendance").countDocuments({
        userId: desk._id,
      }),
      22,
    );
    await rejects(
      ok(ST.mark, A.owner, {
        body: { userId: desk._id, date: day(23), status: "sleeping" },
      }),
      400,
    );
    await rejects(
      ok(ST.mark, B.owner, {
        body: { userId: desk._id, date: day(23), status: "present" },
      }),
      404,
      /not found/i,
    );
    const m = await Member.findOne({ tenantId: A.tid });
    await P.create({
      tenantId: A.tid,
      branchId: A.branch._id,
      memberId: m._id,
      trainerId: A.trainer._id,
      totalSessions: 5,
      pricePerSession: 1000,
      commissionPercent: 40,
      sessions: [
        {
          scheduledAt: new Date("2026-09-10T05:00:00Z"),
          status: "completed",
          completedAt: new Date("2026-09-10T06:00:00Z"),
        },
        {
          scheduledAt: new Date("2026-10-10T05:00:00Z"),
          status: "completed",
          completedAt: new Date("2026-10-10T06:00:00Z"),
        },
      ],
    });
    const r = await ok(ST.payroll, A.owner, { query: { month } });
    const row = r.data.find((x) => x.userId.equals(desk._id));
    assert.strictEqual(row.payableDays, 21);
    assert.strictEqual(row.basePay, 21000);
    assert.strictEqual(row.unmarkedDays, 8);
    const tr = r.data.find((x) => x.userId.equals(A.trainer._id));
    assert.strictEqual(tr.ptSessions, 1, "only September's session counts");
    assert.strictEqual(tr.commission, 400);
    assert.ok(
      !r.data.some((x) => x.name.startsWith("Bravo")),
      "other gym's staff not listed",
    );
    const grid = await ok(ST.getMonth, A.owner, { query: { month } });
    assert.strictEqual(grid.days, 30);
    assert.strictEqual(
      grid.data.find((x) => x.name === "Payroll Desk").marks[21],
      "present",
    );
  });

  console.log("\nMember portal & online payments");
  await test("portal access, member lockout from staff APIs, own-data only, secure online payment", async () => {
    process.env.ENCRYPTION_SECRET =
      process.env.ENCRYPTION_SECRET || "test-enc-secret";
    const crypto = require("crypto");
    const jwt = require("jsonwebtoken");
    const PORTAL = require("../controllers/portalController");
    const SC = require("../controllers/settingController");
    const pay = require("../utils/gymPay");
    const Setting = M("Setting");
    const protect = require("../middleware/auth").protect;

    // desk grants access
    const m1 = await mkMember(A, "Portal Pat", "9444000001");
    const m2 = await mkMember(A, "Other Person", "9444000002");
    const g = await ok(PORTAL.grantAccess, A.owner, {
      params: { id: String(m1._id) },
    });
    assert.ok(g.data.password.length >= 8 && /@/.test(g.data.login));
    const u = await User.findOne({ email: g.data.login }).select("+password");
    assert.strictEqual(u.role, "member");
    assert.ok(await u.matchPassword(g.data.password));
    assert.strictEqual(
      (await Member.findById(m1._id)).userId.toString(),
      u._id.toString(),
    );
    const g2 = await ok(PORTAL.grantAccess, A.owner, {
      params: { id: String(m1._id) },
    }); // reset
    assert.notStrictEqual(g2.data.password, g.data.password);
    assert.strictEqual(
      await User.countDocuments({ tenantId: A.tid, role: "member" }),
      1,
      "reset reuses the same login",
    );

    // a member token is refused everywhere except /portal and /auth
    const tok = jwt.sign({ id: u._id }, process.env.JWT_SECRET);
    const hit = (url) =>
      new Promise((r) => {
        const res = {
          statusCode: 200,
          status(c) {
            this.statusCode = c;
            return this;
          },
        };
        protect(
          {
            headers: { authorization: `Bearer ${tok}` },
            originalUrl: url,
            method: "GET",
            body: {},
          },
          res,
          (e) => r({ e, code: res.statusCode }),
        );
      });
    assert.strictEqual((await hit("/api/members")).code, 403);
    assert.strictEqual((await hit("/api/dashboard/summary")).code, 403);
    assert.strictEqual((await hit("/api/reports/overview")).code, 403);
    assert.strictEqual((await hit("/api/portal/overview")).e, undefined);

    // own data only
    await ok(MS.createMembership, A.owner, {
      body: { memberId: m1._id, planId: A.monthly._id, payNow: 0 },
    });
    await ok(MS.createMembership, A.owner, {
      body: { memberId: m2._id, planId: A.monthly._id, payNow: 0 },
    });
    const ov = await ok(PORTAL.overview, u, {});
    assert.strictEqual(ov.data.member.name, "Portal Pat");
    assert.strictEqual(ov.data.due, 1770);
    const invs = await ok(PORTAL.invoices, u, {});
    assert.ok(
      invs.data.length === 1 &&
        invs.data.every((i) => String(i.memberId) === String(m1._id)),
    );
    const others = await Invoice.findOne({ memberId: m2._id });
    assert.strictEqual(
      (
        await call(PORTAL.createPayOrder, u, {
          params: { id: String(others._id) },
          body: {},
        })
      ).code,
      404,
    );
    assert.strictEqual(
      (await call(PORTAL.overview, A.owner, {})).code,
      403,
      "staff are not members",
    );

    // payments are off until the gym saves its own keys; the secret is never echoed back
    const mine = invs.data[0];
    assert.strictEqual(
      (
        await call(PORTAL.createPayOrder, u, {
          params: { id: String(mine._id) },
          body: {},
        })
      ).code,
      400,
    );
    await ok(SC.updateSettings, A.owner, {
      body: {
        onlinePaymentsEnabled: true,
        razorpayKeyId: "rzp_test_abc",
        razorpayKeySecret: "super-secret-key",
        razorpayKeySecretEnc: "forged",
      },
    });
    const shown = await ok(SC.getSettings, A.owner, {});
    assert.strictEqual(shown.data.razorpayKeySecretEnc, undefined);
    assert.strictEqual(shown.data.razorpaySecretSaved, true);
    const raw = await Setting.collection.findOne({ tenantId: A.tid });
    assert.ok(
      raw.razorpayKeySecretEnc &&
        !raw.razorpayKeySecretEnc.includes("super-secret") &&
        raw.razorpayKeySecretEnc !== "forged",
      "stored encrypted, client can't write the field",
    );

    let nextPayment = null;
    pay.api.createOrder = async (_c, p) => ({
      id: "order_1",
      amount: p.amount,
      currency: "INR",
    });
    pay.api.fetchPayment = async () => nextPayment;
    const ord = await ok(PORTAL.createPayOrder, u, {
      params: { id: String(mine._id) },
      body: { amount: 500 },
    });
    assert.strictEqual(ord.data.amount, 50000);
    assert.strictEqual(ord.data.key, "rzp_test_abc");
    await rejects(
      ok(PORTAL.createPayOrder, u, {
        params: { id: String(mine._id) },
        body: { amount: 99999 },
      }),
      400,
    );

    const sig = (o, p) =>
      crypto
        .createHmac("sha256", "super-secret-key")
        .update(`${o}|${p}`)
        .digest("hex");
    const verify = (body) =>
      call(PORTAL.verifyPayment, u, { params: { id: String(mine._id) }, body });
    nextPayment = {
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      notes: { invoiceId: String(mine._id) },
    };
    assert.strictEqual(
      (
        await verify({
          razorpayOrderId: "order_1",
          razorpayPaymentId: "pay_1",
          razorpaySignature: "bad",
        })
      ).code,
      400,
      "forged signature",
    );
    nextPayment = {
      order_id: "order_999",
      status: "captured",
      amount: 50000,
      notes: {},
    };
    assert.strictEqual(
      (
        await verify({
          razorpayOrderId: "order_1",
          razorpayPaymentId: "pay_1",
          razorpaySignature: sig("order_1", "pay_1"),
        })
      ).code,
      400,
      "payment for a different order",
    );
    nextPayment = {
      order_id: "order_1",
      status: "failed",
      amount: 50000,
      notes: {},
    };
    assert.strictEqual(
      (
        await verify({
          razorpayOrderId: "order_1",
          razorpayPaymentId: "pay_1",
          razorpaySignature: sig("order_1", "pay_1"),
        })
      ).code,
      400,
      "failed payment",
    );
    nextPayment = {
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      notes: { invoiceId: String(mine._id) },
    };
    const good = await verify({
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_1",
      razorpaySignature: sig("order_1", "pay_1"),
    });
    assert.strictEqual(good.code, 200, good.message || good.err?.message);
    await verify({
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_1",
      razorpaySignature: sig("order_1", "pay_1"),
    }); // browser retry
    const after = await Invoice.findById(mine._id);
    assert.strictEqual(after.paidAmount, 500, "paid once, retry ignored");
    assert.strictEqual(after.status, "partial");
    assert.strictEqual(after.payments[0].method, "online");
    assert.strictEqual(after.payments[0].reference, "pay_1");
    assert.strictEqual(
      (await Membership.findById(after.membershipId)).paidAmount,
      500,
      "membership dues follow",
    );
    assert.strictEqual(
      (
        await call(
          require("../controllers/userController").getUsers,
          A.owner,
          {},
        )
      ).body.data.some((x) => x.role === "member"),
      false,
      "members are not in the staff list",
    );
  });

  console.log("\nPayment links");
  await test("WhatsApp pay link: public flow, forged/replayed payments, monthly send once", async () => {
    const crypto = require("crypto");
    const L = require("../utils/paymentLinks");
    const pay = require("../utils/gymPay");
    const m = await mkMember(A, "Link Larry", "9666000001");
    await ok(MS.createMembership, A.owner, {
      body: { memberId: m._id, planId: A.monthly._id, payNow: 100 },
    });
    const inv = await Invoice.findOne({ memberId: m._id });
    const owed = inv.totalAmount - inv.paidAmount;
    assert.ok(owed > 1);

    const link = await runWithTenant(A.tid, () => L.ensureLink(A.tid, inv));
    const again = await runWithTenant(A.tid, () => L.ensureLink(A.tid, inv));
    assert.strictEqual(again.token, link.token, "one link per invoice");
    assert.ok(link.token.length >= 30);
    await rejects(L.details("short"), undefined).catch(() => {});
    assert.strictEqual(await L.details("x".repeat(40)), null);

    // public side: no tenant context at all
    const d = await L.details(link.token);
    assert.strictEqual(d.status, "pending");
    assert.strictEqual(d.amount, owed);
    pay.api.createOrder = async (_c, p) => ({ id: "order_L1", amount: p.amount, currency: "INR" });
    const o = await L.start(link.token);
    assert.strictEqual(o.amount, Math.round(owed * 100));
    assert.strictEqual(o.key, "rzp_test_abc");

    const sig = (oid, pid) => crypto.createHmac("sha256", "super-secret-key").update(`${oid}|${pid}`).digest("hex");
    const body = { razorpayOrderId: "order_L1", razorpayPaymentId: "pay_L1", razorpaySignature: sig("order_L1", "pay_L1") };
    await rejects(L.confirm(link.token, { ...body, razorpaySignature: "forged" }), 400);
    await rejects(L.confirm(link.token, { ...body, razorpayOrderId: "order_other" }), 400);
    pay.api.fetchPayment = async () => ({ order_id: "order_L1", status: "failed", amount: Math.round(owed * 100), notes: {} });
    await rejects(L.confirm(link.token, body), 400);
    pay.api.fetchPayment = async () => ({ order_id: "order_L1", status: "captured", amount: Math.round(owed * 100), notes: { invoiceId: String(inv._id) } });

    // monthly WhatsApp send happens once per invoice per month (fetch is stubbed; no real network)
    process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = "1";
    const realFetch = global.fetch;
    const sent = [];
    global.fetch = async (_u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({}) }; };
    try {
      const s1 = await runWithTenant(A.tid, () => L.sendDue(A.tid));
      assert.ok(s1.sent >= 1);
      const mine = sent.find((x) => x.to === "919666000001");
      assert.ok(mine, "sent to the member's number");
      assert.ok(mine.template.components[0].parameters.some((p) => p.text.includes(link.token)));
      const n = sent.length;
      await runWithTenant(A.tid, () => L.sendDue(A.tid));
      assert.strictEqual(sent.length, n, "second run in the same month sends nothing");
    } finally {
      global.fetch = realFetch;
    }

    const r = await L.confirm(link.token, body);
    assert.strictEqual(r.status, "paid");
    await L.confirm(link.token, body); // double callback
    const after = await Invoice.findById(inv._id);
    assert.strictEqual(after.paidAmount, inv.paidAmount + owed, "counted once");
    assert.strictEqual(after.status, "paid");
    assert.strictEqual((await L.details(link.token)).status, "paid");
    await rejects(L.start(link.token), 409);
    await rejects(runWithTenant(A.tid, () => L.ensureLink(A.tid, after)), 409);
  });

  console.log("\nTrainer on new member");
  await test("trainer picked while adding a member is assigned; a full or foreign trainer rejects the form", async () => {
    const TA = require("../models/TrainerAssignment");
    const r = await ok(MEM.createMember, A.owner, {
      body: { name: "Coached Cara", phone: "9777000001", branchId: A.branch._id, trainerId: A.trainer._id },
    });
    const asg = await TA.findOne({ memberId: r.data._id, isActive: true });
    assert.ok(asg && String(asg.trainerId) === String(A.trainer._id));
    await rejects(call(MEM.createMember, A.owner, { body: { name: "Ghost", phone: "9777000002", branchId: A.branch._id, trainerId: String(B.trainer._id) } }).then((x) => { if (x.code >= 400) { const e = new Error(x.message); e.status = x.code; throw e; } }), 404);
    assert.strictEqual(await Member.countDocuments({ tenantId: A.tid, phone: "9777000002" }), 0, "no member created");
    await User.updateOne({ _id: A.trainer._id }, { "trainerProfile.maxClients": 1 });
    const full = await call(MEM.createMember, A.owner, { body: { name: "Overflow", phone: "9777000003", branchId: A.branch._id, trainerId: A.trainer._id } });
    assert.strictEqual(full.code, 409);
    assert.strictEqual(await Member.countDocuments({ tenantId: A.tid, phone: "9777000003" }), 0);
    await User.updateOne({ _id: A.trainer._id }, { $unset: { "trainerProfile.maxClients": 1 } });
  });

  console.log("\nDates");
  await test("date-picker days are IST calendar days", async () => {
    const s = G.istDay("2026-10-17"),
      e = G.istDay("2026-10-17", true);
    assert.strictEqual(s.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.strictEqual(e.toISOString(), "2026-10-17T18:29:59.999Z");
  });

  console.log("\nSaaS plans");
  await test("market-rate plans: term discounts, limits and legacy keys", async () => {
    assert.strictEqual(Subscription.planPrice("starter", "monthly"), 79900);
    assert.strictEqual(
      Subscription.planPrice("growth", "quarterly"),
      Math.round(149900 * 3 * 0.9),
    );
    assert.strictEqual(
      Subscription.planPrice("pro", "yearly"),
      Math.round(249900 * 12 * 0.7),
    );
    assert.strictEqual(Subscription.planPrice("enterprise", "yearly"), null);
    assert.strictEqual(Subscription.PLAN_LIMITS.elite.members, Infinity);
    assert.ok(
      Subscription.planPrice("professional", "monthly") > 0,
      "legacy plan still billable",
    );
  });

  console.log("\nMigration of a legacy database");
  await test("dry run writes nothing; apply backfills; second apply is a no-op", async () => {
    const { migrate } = require("../scripts/migrate-gym");
    const D = await mkGym("Legacy");
    const mem = await Member.collection.insertOne({
      tenantId: D.tid,
      branchId: D.branch._id,
      name: "Old Member",
      phone: "9777000001",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const mship = await Membership.collection.insertOne({
      tenantId: D.tid,
      branchId: D.branch._id,
      memberId: mem.insertedId,
      planId: D.monthly._id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 10),
      status: "active",
      freezeHistory: [],
    });
    await Invoice.collection.insertOne({
      tenantId: D.tid,
      branchId: D.branch._id,
      memberId: mem.insertedId,
      membershipId: mship.insertedId,
      invoiceNumber: "INV-00007",
      amount: 1000,
      gstAmount: 180,
      totalAmount: 1180,
      paymentMethod: "upi",
      status: "paid",
      issuedAt: new Date(),
    });
    await Tenant.collection.updateOne(
      { _id: D.tid },
      { $set: { limits: { leadsPerMonth: 100, teamMembers: 2 } } },
    );

    const quiet = () => {};
    const dry = await migrate({ apply: false, log: quiet });
    assert.ok(dry.memberCodesAssigned >= 1 && dry.invoicesBackfilled >= 1);
    assert.strictEqual(
      (await Member.collection.findOne({ _id: mem.insertedId })).memberCode,
      undefined,
      "dry run wrote nothing",
    );

    await migrate({ apply: true, log: quiet });
    const m2 = await Member.collection.findOne({ _id: mem.insertedId });
    assert.ok(/^GYM-\d{5}$/.test(m2.memberCode));
    const inv = await Invoice.collection.findOne({
      invoiceNumber: "INV-00007",
      tenantId: D.tid,
    });
    assert.strictEqual(inv.paidAmount, 1180);
    assert.strictEqual(inv.payments.length, 1);
    assert.strictEqual(inv.items[0].unitPrice, 1000);
    const ms2 = await Membership.collection.findOne({ _id: mship.insertedId });
    assert.strictEqual(ms2.planName, "Monthly");
    assert.strictEqual(ms2.paidAmount, 1180);
    assert.strictEqual(
      (await Counter.findOne({ tenantId: D.tid, key: "invoice" })).seq,
      7,
      "next invoice continues after INV-00007",
    );
    const nx = await G.createInvoice({
      tenantId: D.tid,
      branchId: D.branch._id,
      items: [{ description: "x", unitPrice: 10 }],
      payFull: true,
    });
    assert.strictEqual(nx.invoiceNumber, "INV-00008");
    const t = await Tenant.collection.findOne({ _id: D.tid });
    assert.strictEqual(t.limits.members, 500);

    const again = await migrate({ apply: true, log: quiet });
    assert.deepStrictEqual(again, {}, "idempotent: nothing left to change");
  });

  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function r2x(n) {
  return Math.round(n * 100) / 100;
}
