// Brings an existing NestGym database up to the new model shape. IDEMPOTENT: re-running changes nothing.
//   node scripts/migrate-gym.js            -> dry run, prints what WOULD change, writes nothing
//   node scripts/migrate-gym.js --apply    -> performs the changes
// Reads MONGO_URI from the environment / .env. Back up first; do NOT point it at production without a snapshot.
require("dotenv").config();
const mongoose = require("mongoose");
async function migrate({
  apply = process.argv.includes("--apply"),
  log = console.log,
} = {}) {
  const APPLY = apply;
  const M = (n) => require(`../models/${n}`);
  const [
    Invoice,
    Member,
    Membership,
    MembershipPlan,
    Attendance,
    Tenant,
    Counter,
    User,
  ] = [
    "Invoice",
    "Member",
    "Membership",
    "MembershipPlan",
    "Attendance",
    "Tenant",
    "Counter",
    "User",
  ].map(M);
  const { PLAN_LIMITS } = M("Subscription");
  const stat = {};
  const bump = (k, n = 1) => (stat[k] = (stat[k] || 0) + n);
  const write = async (fn) => {
    if (APPLY) await fn();
  };

  // 1. Invoice numbers were globally unique -> per tenant. Drop the legacy index.
  const idx = await Invoice.collection.indexes().catch(() => []);
  if (idx.some((i) => i.name === "invoiceNumber_1" && i.unique)) {
    bump("legacyInvoiceIndexDropped");
    await write(() => Invoice.collection.dropIndex("invoiceNumber_1"));
  }

  // 2. Attendance: collapse duplicate open visits (keep the newest) so the one-open-visit index can build.
  const dupOpen = await Attendance.aggregate([
    { $match: { checkoutAt: null } },
    {
      $group: {
        _id: "$memberId",
        ids: { $push: { id: "$_id", at: "$checkinAt" } },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]);
  for (const d of dupOpen) {
    const sorted = d.ids.sort((a, b) => b.at - a.at).slice(1);
    for (const o of sorted) {
      bump("duplicateOpenVisitsClosed");
      await write(() =>
        Attendance.updateOne(
          { _id: o.id },
          {
            $set: {
              checkoutAt: new Date(o.at.getTime() + 2 * 3600 * 1000),
              durationMin: 120,
              autoCheckout: true,
            },
          },
        ),
      );
    }
  }

  // 3. Member codes (GYM-00001...) in joining order, per tenant.
  const tenants = await Member.distinct("tenantId");
  for (const t of tenants) {
    const have = await Member.find({
      tenantId: t,
      memberCode: { $type: "string" },
    })
      .select("memberCode")
      .lean();
    let seq = have.reduce(
      (mx, m) =>
        Math.max(
          mx,
          parseInt(String(m.memberCode).replace(/\D/g, ""), 10) || 0,
        ),
      0,
    );
    const without = await Member.find({
      tenantId: t,
      $or: [{ memberCode: { $exists: false } }, { memberCode: null }],
    })
      .sort("createdAt")
      .select("_id")
      .lean();
    for (const m of without) {
      seq += 1;
      bump("memberCodesAssigned");
      await write(() =>
        Member.updateOne(
          { _id: m._id },
          { $set: { memberCode: `GYM-${String(seq).padStart(5, "0")}` } },
        ),
      );
    }
    if (without.length)
      await write(() =>
        Counter.updateOne(
          { tenantId: t, key: "member" },
          { $max: { seq } },
          { upsert: true },
        ),
      );
  }

  // 4. Invoice counter = highest existing number per tenant; invoices get items + payment ledger.
  for (const t of await Invoice.distinct("tenantId")) {
    const nums = await Invoice.find({ tenantId: t })
      .select("invoiceNumber")
      .lean();
    const max = nums.reduce(
      (mx, i) =>
        Math.max(
          mx,
          parseInt(String(i.invoiceNumber).replace(/\D/g, ""), 10) || 0,
        ),
      0,
    );
    await write(() =>
      Counter.updateOne(
        { tenantId: t, key: "invoice" },
        { $max: { seq: max } },
        { upsert: true },
      ),
    );
  }
  const oldInvoices = await Invoice.find({
    $or: [{ items: { $exists: false } }, { items: { $size: 0 } }],
    status: { $ne: "cancelled" },
  }).lean();
  for (const inv of oldInvoices) {
    const paid = inv.status === "paid" ? inv.totalAmount : 0;
    bump("invoicesBackfilled");
    await write(() =>
      Invoice.collection.updateOne(
        { _id: inv._id },
        {
          $set: {
            items: [
              {
                kind: inv.membershipId ? "membership" : "other",
                description: inv.membershipId
                  ? "Gym membership"
                  : "Gym services",
                quantity: 1,
                unitPrice: inv.amount,
                gstPercent: inv.amount
                  ? Math.round((inv.gstAmount / inv.amount) * 100)
                  : 0,
                amount: inv.amount,
              },
            ],
            paidAmount: paid,
            discount: inv.discount || 0,
            payments: paid
              ? [
                  {
                    amount: paid,
                    method: inv.paymentMethod || "cash",
                    paidAt: inv.issuedAt || inv.createdAt,
                    type: "payment",
                    note: "Migrated from legacy invoice",
                  },
                ]
              : [],
          },
        },
      ),
    );
  }

  // 5. Memberships get a price snapshot + paid amount from their invoice (or the plan, if never billed).
  const plans = new Map(
    (await MembershipPlan.find().lean()).map((p) => [String(p._id), p]),
  );
  const olds = await Membership.find({ planName: { $exists: false } }).lean();
  for (const m of olds) {
    const plan = plans.get(String(m.planId));
    const inv = await Invoice.findOne({ membershipId: m._id }).lean();
    const price = plan?.price || 0;
    const total = inv
      ? inv.totalAmount
      : r2(price * (1 + (plan?.gstPercent ?? 18) / 100));
    const paid = inv
      ? inv.status === "paid"
        ? inv.totalAmount
        : inv.paidAmount || 0
      : total;
    bump("membershipsBackfilled");
    await write(() =>
      Membership.collection.updateOne(
        { _id: m._id },
        {
          $set: {
            planName: plan?.name || "Plan",
            price,
            totalAmount: total,
            paidAmount: paid,
            originalEndDate: m.endDate,
          },
        },
      ),
    );
  }

  // 6. Tenant limits follow the (new) gym plan table.
  for (const t of await Tenant.find().lean()) {
    const l = PLAN_LIMITS[t.plan] || PLAN_LIMITS.trial;
    const want = {
      members: l.members === Infinity ? null : l.members,
      branches: l.branches === Infinity ? null : l.branches,
      staff: l.staff === Infinity ? null : l.staff,
    };
    if (
      JSON.stringify([
        t.limits?.members,
        t.limits?.branches,
        t.limits?.staff,
      ]) !== JSON.stringify([want.members, want.branches, want.staff])
    ) {
      bump("tenantLimitsUpdated");
      await write(() =>
        Tenant.collection.updateOne(
          { _id: t._id },
          { $set: { limits: want }, $unset: { usage: "" } },
        ),
      );
    }
  }
  // user employee counter
  for (const t of await User.distinct("tenantId", {
    tenantId: { $ne: null },
  })) {
    const n = await User.countDocuments({ tenantId: t });
    await write(() =>
      Counter.updateOne(
        { tenantId: t, key: "employee" },
        { $max: { seq: n } },
        { upsert: true },
      ),
    );
  }

  // 7. Indexes last (needs steps 1-3 done).
  if (APPLY)
    for (const n of ["Invoice", "Member", "Membership", "Attendance"])
      await M(n).syncIndexes();

  log(
    APPLY ? "APPLIED:" : "DRY RUN (nothing written) — would change:",
    JSON.stringify(stat, null, 2),
  );
  return stat;
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

module.exports = { migrate };

if (require.main === module) {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() =>
      console.log(
        "Connected to",
        mongoose.connection.host,
        mongoose.connection.name,
      ),
    )
    .then(() => migrate())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
