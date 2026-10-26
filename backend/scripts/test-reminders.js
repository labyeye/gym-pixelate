// Reminder selection + once-only guarantee on a THROWAWAY in-memory database, WhatsApp mocked:  node scripts/test-reminders.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.WHATSAPP_REMINDER_EXPIRING_TEMPLATE = "t_exp";
  process.env.WHATSAPP_REMINDER_EXPIRED_TEMPLATE = "t_expd";
  process.env.WHATSAPP_REMINDER_BIRTHDAY_TEMPLATE = "t_bday";
  const mongoose = require("mongoose");
  mongoose.plugin(require("../utils/tenantScope").tenantScopePlugin);
  await mongoose.connect(mongod.getUri("gymrem"));
  const wa = require("../utils/whatsappOtp");
  const sent = [];
  wa.sendPlatformTemplate = async (phone, tpl, params) => sent.push([phone, tpl, params[0]]);
  const rem = require("../utils/reminders");
  const Member = require("../models/Member");
  const Membership = require("../models/Membership");
  const id = () => new mongoose.Types.ObjectId();
  const tenantId = id(), branchId = id(), planId = id();
  const day = 86400000, now = new Date();
  const mk = (name, phone, extra = {}) => Member.collection.insertOne({ _id: id(), tenantId, branchId, name, phone, status: "active", ...extra });
  const ms = (memberId, status, endDate) => Membership.collection.insertOne({ _id: id(), tenantId, branchId, memberId, planId, startDate: new Date(now - 30 * day), endDate, status });

  const a = (await mk("Asha", "9876500001")).insertedId;
  const b = (await mk("Bela", "9876500002")).insertedId;
  const c = (await mk("Chitra", "9876500003", { whatsappOptIn: false })).insertedId;
  const d = (await mk("Dev", "9876500004", { dob: new Date(Date.UTC(1990, new Date(now.getTime() + 19800000).getUTCMonth(), new Date(now.getTime() + 19800000).getUTCDate())) })).insertedId;
  await ms(a, "active", new Date(now.getTime() + 2 * day)); // expiring
  await ms(b, "expired", new Date(now.getTime() - 1 * day)); // expired, not renewed
  await ms(c, "active", new Date(now.getTime() + 1 * day)); // opted out

  const s = { tenantId, companyName: "Test Gym", reminders: { expiring: true, expired: true, birthday: true } };
  const r1 = await rem.runForGym(s);
  assert.strictEqual(r1.sent, 3, JSON.stringify([r1, sent]));
  assert.deepStrictEqual(sent.map((x) => x[1]).sort(), ["t_bday", "t_exp", "t_expd"]);
  const r2 = await rem.runForGym(s);
  assert.strictEqual(r2.sent, 0, "second run sends nothing");
  console.log("REMINDERS OK");
  await mongod.stop();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
