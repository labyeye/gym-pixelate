// node scripts/test-analytics.js  (in-memory MongoDB: every Insights category runs and returns the right shape)
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongod.getUri());
    const Member = require("../models/Member");
    const Branch = require("../models/Branch");
    const { analytics } = require("../controllers/analyticsController");
    const tenantId = new mongoose.Types.ObjectId();
    const b = await Branch.create({ tenantId, name: "Main", city: "Pune" });
    await Member.create({ tenantId, branchId: b._id, name: "A", phone: "9000000001", gender: "male", city: "Pune", pincode: "411001", dob: new Date("2000-01-01"), source: "walk_in" });
    const call = (category) =>
      new Promise((resolve, reject) => {
        const res = { status() { return res; }, json: (x) => resolve(x.data) };
        analytics({ query: { category }, user: { tenantId } }, res, reject);
      });
    for (const c of ["revenue", "members", "plans", "retention", "attendance", "locations"]) {
      const d = await call(c);
      assert(d && typeof d === "object", c);
    }
    const mem = await call("members");
    assert.equal(mem.gender[0].value, 1);
    assert.equal(mem.ageBands.find((x) => x.label === "26-35").value, 1);
    const loc = await call("locations");
    assert.equal(loc.branches[0].members, 1);
    assert.equal(loc.cities[0].label, "pune");
    console.log("analytics OK");
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
})().catch((e) => { console.error(e); process.exit(1); });
