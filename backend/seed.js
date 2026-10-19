const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const connectDB = require("./config/db");
const Tenant = require("./models/Tenant");
const User = require("./models/User");
const Branch = require("./models/Branch");
const MembershipPlan = require("./models/MembershipPlan");
const Member = require("./models/Member");
const Membership = require("./models/Membership");
const Invoice = require("./models/Invoice");

const seed = async () => {
  await connectDB();

  console.log("Clearing existing demo data for slug 'demo-gym'...");
  const existingTenant = await Tenant.findOne({ slug: "demo-gym" });
  if (existingTenant) {
    const branches = await Branch.find({ tenantId: existingTenant._id });
    const branchIds = branches.map((b) => b._id);
    const members = await Member.find({ tenantId: existingTenant._id });
    const memberIds = members.map((m) => m._id);

    await Promise.all([
      Invoice.deleteMany({ tenantId: existingTenant._id }),
      Membership.deleteMany({ tenantId: existingTenant._id }),
      Member.deleteMany({ tenantId: existingTenant._id }),
      MembershipPlan.deleteMany({ tenantId: existingTenant._id }),
      Branch.deleteMany({ tenantId: existingTenant._id }),
      User.deleteMany({ tenantId: existingTenant._id }),
    ]);
    await Tenant.deleteOne({ _id: existingTenant._id });
    console.log("Cleared previous demo data.");
  }

  console.log("Creating owner user...");
  const owner = await User.create({
    name: "Demo Owner",
    email: "owner@demogym.test",
    password: "Demo@1234",
    role: "gym_owner",
    phone: "9999900000",
    status: "active",
  });

  console.log("Creating tenant...");
  const tenant = await Tenant.create({
    name: "Demo Gym Co",
    slug: "demo-gym",
    ownerUser: owner._id,
    plan: "trial",
  });

  owner.tenantId = tenant._id;
  await owner.save({ validateBeforeSave: false });

  console.log("Creating branch...");
  const branch = await Branch.create({
    tenantId: tenant._id,
    name: "Main Branch",
    address: "123 Fitness Street",
    city: "Mumbai",
    phone: "9999911111",
    timing: { open: "06:00", close: "22:00" },
  });

  owner.branchId = branch._id;
  await owner.save({ validateBeforeSave: false });

  console.log("Creating membership plans...");
  const [monthly, quarterly, annual] = await MembershipPlan.create([
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Monthly",
      type: "monthly",
      durationDays: 30,
      price: 1500,
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Quarterly",
      type: "quarterly",
      durationDays: 90,
      price: 4000,
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Annual",
      type: "annual",
      durationDays: 365,
      price: 15000,
    },
  ]);

  console.log("Creating demo members...");
  const members = await Member.create([
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Aarav Sharma",
      email: "aarav@example.com",
      phone: "9000000001",
      gender: "male",
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Priya Verma",
      email: "priya@example.com",
      phone: "9000000002",
      gender: "female",
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Rohan Gupta",
      email: "rohan@example.com",
      phone: "9000000003",
      gender: "male",
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Sneha Iyer",
      email: "sneha@example.com",
      phone: "9000000004",
      gender: "female",
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      name: "Karan Mehta",
      email: "karan@example.com",
      phone: "9000000005",
      gender: "male",
    },
  ]);

  console.log("Creating memberships for first 3 members...");
  const plans = [monthly, quarterly, annual];
  const memberships = [];
  for (let i = 0; i < 3; i++) {
    const plan = plans[i];
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const membership = await Membership.create({
      tenantId: tenant._id,
      branchId: branch._id,
      memberId: members[i]._id,
      planId: plan._id,
      startDate,
      endDate,
      status: "active",
    });
    memberships.push(membership);
  }

  console.log("Creating invoices...");
  const invoicesData = [
    { member: members[0], plan: monthly, membership: memberships[0] },
    { member: members[1], plan: quarterly, membership: memberships[1] },
    { member: members[2], plan: annual, membership: memberships[2] },
  ];

  let invoiceSeq = 1;
  for (const { member, plan, membership } of invoicesData) {
    const gstAmount = Math.round((plan.price * plan.gstPercent) / 100);
    await Invoice.create({
      tenantId: tenant._id,
      branchId: branch._id,
      memberId: member._id,
      membershipId: membership._id,
      invoiceNumber: `INV-${String(invoiceSeq++).padStart(5, "0")}`,
      amount: plan.price,
      gstAmount,
      totalAmount: plan.price + gstAmount,
      paymentMethod: "cash",
      status: "paid",
    });
  }

  console.log("\n=== Seed complete ===");
  console.log("Tenant ID:", tenant._id.toString());
  console.log("Branch ID:", branch._id.toString());
  console.log("Owner login: owner@demogym.test / Demo@1234");
  console.log("Member IDs:", members.map((m) => m._id.toString()).join(", "));
  console.log(
    "Membership Plan IDs:",
    plans.map((p) => p._id.toString()).join(", "),
  );

  process.exit(0);
};

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
