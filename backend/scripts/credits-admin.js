// Turn WhatsApp credits on for a company, or gift credits.
//   node scripts/credits-admin.js enable <tenantId> [bonusCredits]
//   node scripts/credits-admin.js enable-all [bonusCredits]      (every gym; only after you reprice the plans)
//   node scripts/credits-admin.js show <tenantId>
// <tenantId> can also be the gym's email (matched on the gym's email or its owner's login email).
require("dotenv").config();
const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
require("../models/User");
const credits = require("../utils/credits");

(async () => {
  let [cmd, arg, bonusArg] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  if (arg && arg.includes("@")) {
    const email = arg.trim().toLowerCase();
    const u = await mongoose.model("User").findOne({ email }).select("tenantId");
    const tenant = (await Tenant.findOne({ email }).select("_id")) || (u && { _id: u.tenantId });
    if (!tenant) throw new Error(`No gym found for ${email}`);
    arg = String(tenant._id);
    console.log("gym:", arg);
  }
  if (cmd === "enable" || cmd === "enable-all") {
    const bonus = Number(cmd === "enable" ? bonusArg : arg) || 0;
    const ids = cmd === "enable" ? [arg] : (await Tenant.find().select("_id")).map((t) => t._id);
    for (const id of ids) {
      await credits.enable(id);
      if (bonus) await credits.grantBonus(id, { credits: bonus, refId: `gift:${id}:${Date.now()}`, note: "Gift" });
    }
    console.log(`credits enabled for ${ids.length} gym(s)` + (bonus ? `, +${bonus} bonus each` : ""));
  } else if (cmd === "show") {
    console.log(await credits.getBalance(arg));
  } else {
    console.log("usage: enable <tenantId> [bonus] | enable-all [bonus] | show <tenantId>");
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
