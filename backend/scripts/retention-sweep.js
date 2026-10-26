// Erases personal data of members whose last membership ended more than the gym's `retentionMonths` ago.
//   node scripts/retention-sweep.js          (dry run, lists who would be erased)
//   node scripts/retention-sweep.js --apply
// Gyms with retentionMonths = 0 are skipped. Run it from cron once a day.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { tenantScopePlugin } = require("../utils/tenantScope");
mongoose.plugin(tenantScopePlugin);

(async () => {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  const Setting = require("../models/Setting");
  const Member = require("../models/Member");
  const Membership = require("../models/Membership");
  const { anonymizeMember } = require("../utils/privacy");
  const { ConsentLog } = require("../models/Privacy");

  let total = 0;
  for (const s of await Setting.find({ retentionMonths: { $gt: 0 } }).lean()) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - s.retentionMonths);
    const members = await Member.find({ tenantId: s.tenantId, erasedAt: { $exists: false }, createdAt: { $lt: cutoff } });
    for (const m of members) {
      const recent = await Membership.exists({ memberId: m._id, endDate: { $gte: cutoff } });
      if (recent) continue;
      total++;
      console.log(`${apply ? "erase" : "would erase"}  tenant=${s.tenantId} member=${m._id}`);
      if (apply) {
        await anonymizeMember(m);
        await ConsentLog.create({ tenantId: m.tenantId, memberId: m._id, purpose: "data_processing", granted: false, source: "retention" });
      }
    }
  }
  console.log(`${apply ? "Erased" : "Would erase"} ${total} member(s)`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
