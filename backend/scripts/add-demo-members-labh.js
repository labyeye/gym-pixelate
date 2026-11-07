/* Adds 5 more demo members (joined today, paid memberships) to the gym of labh@gym.com:  node scripts/add-demo-members-labh.js
 * Same safety as seed-demo-labh.js: WhatsApp off, example.com emails. Skips names that already exist. */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const M = {};
for (const n of [
  "User",
  "Branch",
  "MembershipPlan",
  "Member",
  "Membership",
  "Invoice",
])
  M[n] = require(`../models/${n}`);
const { nextCode, computeTotals } = require("../utils/gym");

const NEW = [
  ["Aarav Malhotra", "male", 41],
  ["Simran Kaur", "female", 42],
  ["Rakesh Tiwari", "male", 43],
  ["Ananya Bose", "female", 44],
  ["Mohit Chauhan", "male", 45],
];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const owner = await M.User.findOne({ email: "labh@gym.com" });
  if (!owner || !owner.tenantId)
    throw new Error("labh@gym.com (with a gym) was not found");
  const tenantId = owner.tenantId;
  const branch = await M.Branch.findOne({ tenantId });
  const plans = await M.MembershipPlan.find({
    tenantId,
    isActive: { $ne: false },
  }).sort({ price: 1 });
  if (!branch || !plans.length)
    throw new Error("gym needs a branch and at least one plan");
  const base = { tenantId, branchId: branch._id };
  const today = new Date();
  today.setHours(9, rnd(0, 50), 0, 0);
  let added = 0;
  for (const [i, [name, gender, photo]] of NEW.entries()) {
    if (await M.Member.findOne({ tenantId, name })) {
      console.log("skip (exists):", name);
      continue;
    }
    const plan = plans[i % plans.length];
    const m = await M.Member.create({
      ...base,
      memberCode: await nextCode(tenantId, "member", "GYM"),
      name,
      phone: `9${rnd(100000000, 999999999)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      whatsappOptIn: false,
      gender,
      dob: new Date(rnd(1985, 2004), rnd(0, 11), rnd(1, 28)),
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302018",
      fitness: {
        goal: ["weight_loss", "muscle_gain", "general_fitness"][i % 3],
        level: "beginner",
        heightCm: rnd(158, 185),
        startWeightKg: rnd(55, 90),
      },
      source: ["walk_in", "referral", "instagram", "google", "walk_in"][i],
      joinedOn: today,
      status: "active",
    });
    const t = computeTotals(
      [
        {
          kind: "membership",
          description: `${plan.name} membership`,
          quantity: 1,
          unitPrice: plan.price,
          gstPercent: plan.gstPercent,
        },
        ...(plan.admissionFee
          ? [
              {
                kind: "admission",
                description: "Admission fee",
                quantity: 1,
                unitPrice: plan.admissionFee,
                gstPercent: plan.gstPercent,
              },
            ]
          : []),
      ],
      0,
    );
    const end = new Date(today.getTime() + plan.durationDays * 86400000);
    const ms = await M.Membership.create({
      ...base,
      memberId: m._id,
      planId: plan._id,
      planName: plan.name,
      startDate: today,
      endDate: end,
      status: "active",
      price: plan.price,
      admissionFee: plan.admissionFee,
      discount: 0,
      gstAmount: t.gst,
      totalAmount: t.total,
      paidAmount: t.total,
      soldBy: owner._id,
    });
    const method = ["upi", "cash", "card", "upi", "cash"][i];
    await M.Invoice.create({
      ...base,
      memberId: m._id,
      membershipId: ms._id,
      invoiceNumber: await nextCode(tenantId, "invoice", "INV"),
      items: t.lines.map((l) => ({ ...l, refId: ms._id })),
      amount: t.taxable,
      discount: 0,
      gstAmount: t.gst,
      totalAmount: t.total,
      paidAmount: t.total,
      paymentMethod: method,
      status: "paid",
      issuedAt: today,
      createdBy: owner._id,
      payments: [
        {
          amount: t.total,
          method,
          paidAt: today,
          reference: method === "upi" ? `UPI${rnd(100000, 999999)}` : undefined,
          receivedBy: owner._id,
        },
      ],
    });
    added++;
    console.log("added", name, "-", plan.name);
  }
  console.log("done,", added, "members added");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
