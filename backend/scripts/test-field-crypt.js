// node scripts/test-field-crypt.js  (in-memory MongoDB: sensitive member fields are ciphertext at rest, plaintext in the app)
process.env.FIELD_ENCRYPTION_KEY = "test-key-1";
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const Member = require("../models/Member");
  const { PREFIX, decryptValue } = require("../utils/fieldCrypt");
  const ids = { tenantId: new mongoose.Types.ObjectId(), branchId: new mongoose.Types.ObjectId() };

  const m = await Member.create({
    ...ids, name: "Asha Rao", phone: "9876543210", memberCode: "GYM-1",
    idProof: { type: "aadhaar", number: "1234 5678 9012" },
    emergencyContact: { name: "Ravi Rao", phone: "9000000001", relation: "Brother" },
    health: { bloodGroup: "O+", conditions: ["Asthma", "Thyroid"], allergies: "Peanuts", medications: "Inhaler", injuries: "Knee" },
    medicalNotes: "Doctor cleared on 1 Oct",
  });

  // 1. what MongoDB really holds
  const raw = await mongoose.connection.collection("members").findOne({ _id: m._id });
  for (const v of [raw.idProof.number, raw.emergencyContact.name, raw.emergencyContact.phone, raw.health.allergies, raw.health.medications, raw.health.injuries, raw.medicalNotes, ...raw.health.conditions])
    assert.ok(String(v).startsWith(PREFIX), "stored as ciphertext: " + v);
  assert.ok(!JSON.stringify(raw).includes("Peanuts") && !JSON.stringify(raw).includes("1234 5678"), "no plaintext anywhere in the stored document");
  assert.strictEqual(raw.health.bloodGroup, "O+", "enum / non-sensitive fields stay readable");
  assert.strictEqual(raw.name, "Asha Rao");

  // 2. the app sees plaintext (document and JSON)
  const doc = await Member.findById(m._id);
  assert.strictEqual(doc.idProof.number, "1234 5678 9012");
  assert.deepStrictEqual([...doc.health.conditions], ["Asthma", "Thyroid"]);
  const json = JSON.parse(JSON.stringify(doc));
  assert.strictEqual(json.health.allergies, "Peanuts");
  assert.strictEqual(json.emergencyContact.phone, "9000000001");
  assert.ok(!("id" in json), "response shape unchanged");

  // 3. updating re-encrypts, and a second save does not double-encrypt
  doc.health.allergies = "Peanuts, Dust";
  doc.health.declarationSignedAt = new Date();
  await doc.save();
  await doc.save();
  const raw2 = await mongoose.connection.collection("members").findOne({ _id: m._id });
  assert.ok(raw2.health.allergies.startsWith(PREFIX));
  assert.strictEqual(decryptValue(raw2.health.allergies), "Peanuts, Dust");

  // 4. legacy plaintext rows still load, and are encrypted the next time they are saved
  await mongoose.connection.collection("members").updateOne({ _id: m._id }, { $set: { "health.medications": "plain legacy value" } });
  const legacy = await Member.findById(m._id);
  assert.strictEqual(legacy.health.medications, "plain legacy value");
  legacy.markModified("health.medications");
  await legacy.save();
  assert.ok((await mongoose.connection.collection("members").findOne({ _id: m._id })).health.medications.startsWith(PREFIX));

  // 5. a wrong key cannot read it
  process.env.FIELD_ENCRYPTION_KEY = "another-key";
  assert.throws(() => decryptValue(raw2.health.allergies));
  console.log("field encryption OK");
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
