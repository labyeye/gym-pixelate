/* Wipes EVERY collection, then creates demo owner (labh@gym.com) + gym + one member portal login.
 * Follow with: node scripts/seed-demo-labh.js ; node scripts/reset-demo.js --member */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Branch = require("../models/Branch");
const Member = require("../models/Member");
const OWNER_PW = "Demo@Gym#58", MEMBER_PW = "Member@Gym#74";
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (process.argv.includes("--member")) {
    const m = await Member.findOne({ status: "active" }).sort({ createdAt: 1 });
    const u = await User.create({ name: m.name, email: "member@gym.com", password: MEMBER_PW, role: "member", phone: m.phone, tenantId: m.tenantId, branchId: m.branchId });
    m.userId = u._id; m.email = "member@gym.com"; await m.save();
    console.log("member login: member@gym.com /", MEMBER_PW, "->", m.name);
    return process.exit(0);
  }
  const db = mongoose.connection.db;
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray())
    if (!name.startsWith("system.")) await db.collection(name).deleteMany({});
  const owner = await User.create({ name: "Labh", email: "labh@gym.com", password: OWNER_PW, role: "gym_owner", phone: "9876500011" });
  const tenant = await Tenant.create({ name: "Iron Paradise Fitness", slug: `iron-paradise-${String(owner._id).slice(-6)}`, ownerUser: owner._id, plan: "trial", onboarded: true, phone: "9876500011", email: "labh@gym.com" });
  const branch = await Branch.create({ tenantId: tenant._id, name: "Main Branch", address: "Plot 14, Model Town Road", city: "Jaipur", phone: "9876500011", timing: { open: "06:00", close: "22:00" } });
  owner.tenantId = tenant._id; owner.branchId = branch._id;
  await owner.save({ validateBeforeSave: false });
  console.log("owner: labh@gym.com /", OWNER_PW);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
