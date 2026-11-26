// Nest Gym side of utils/crmAccounts.js.
const Subscription = require("../models/Subscription");
const { FLAT_YEARLY, GST_RATE } = Subscription;

// KHT/GYM/001, same counter the self-serve billing uses (every paid subscription invoice).
async function nextBillNumber() {
  const r = await Subscription.aggregate([
    { $unwind: "$invoices" },
    { $match: { "invoices.status": "paid" } },
    { $count: "total" },
  ]);
  return `KHT/GYM/${String((r[0]?.total || 0) + 1).padStart(3, "0")}`;
}

module.exports = require("./crmTenantAdapter")({
  label: "Gym",
  Tenant: require("../models/Tenant"),
  User: require("../models/User"),
  ownerRole: "gym_owner",
  defaultRole: "receptionist",
  hideRoles: ["member"], // gym members have logins too; they're managed inside the gym app
  limitFields: [
    { key: "members", label: "Member limit", path: "limits.members" },
    { key: "branches", label: "Branch limit", path: "limits.branches" },
    { key: "staff", label: "Staff limit", path: "limits.staff" },
  ],
  defaultLimits: { members: 1500, branches: 3, staff: 40 },
  defaultPlan: "nestgym",
  // dashboard prefills "Amount paid" with flat + GST and a 12 month term
  pricing: { flat: FLAT_YEARLY.nestgym / 100, gstRate: GST_RATE, label: "Nest Gym, per year" },
  createTenant: (b, { email, phone }) => ({
    email,
    phone: phone || "",
    onboarded: true,
  }),
  // Subscription record (+ a paid GST invoice when an amount was entered) so it shows on the gym's billing page
  // and in the dashboard invoices list.
  afterCreate: async (t, b) => {
    const paid = Math.round(Number(b.amountPaid) * 100) || 0;
    const now = new Date();
    const yearly = Number(b.months) >= 12;
    const base = Math.round(paid / (1 + GST_RATE));
    const invoiceNumber = paid > 0 ? await nextBillNumber() : null;
    await Subscription.create({
      tenant: t._id,
      plan: t.plan,
      billingCycle: yearly ? "yearly" : "monthly",
      status: "active",
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: t.planExpiresAt,
      nextBillingDate: t.planExpiresAt,
      amount: paid / 100,
      paymentMethod: "crm",
      invoices: paid > 0
        ? [{ invoiceNumber, amount: paid, baseAmount: base, gstAmount: paid - base, plan: t.plan, billingCycle: yearly ? "yearly" : "monthly", status: "paid", paidAt: now }]
        : [],
    });
    return invoiceNumber;
  },
  usage: (t, users) =>
    `limits: ${t.limits?.members ?? "—"} members · ${t.limits?.branches ?? "—"} branches · ${users} logins`,
});
