// DPDP pack (export, erase, consent, waiver) on a THROWAWAY in-memory database:  node scripts/test-privacy.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("gymprivacy");
  process.env.JWT_SECRET = "privacy-secret";
  process.env.ENCRYPTION_SECRET = "privacy-enc";
  process.env.PORT = "5097";
  process.env.NODE_ENV = "test";
  require("../server");
  await new Promise((r) => setTimeout(r, 1500));
  const base = "http://127.0.0.1:5097/api";
  let token = "";
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ...(await res.json().catch(() => ({}))), status: res.status };
  };

  const reg = await call("POST", "/auth/register", { name: "Own Er", email: "o@p.gym", password: "Kx7#mQv29!", companyName: "P Fit" });
  token = reg.data.token;
  await call("POST", "/legal/accept", {});
  const m = (await call("POST", "/members", { name: "Ravi Kumar", phone: "9876543210", email: "ravi@x.in", medicalNotes: "asthma" })).data;

  // waiver: needs template, then versioning
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/waivers`, { signedName: "Ravi Kumar" })).status, 400);
  assert.strictEqual((await call("PUT", "/privacy/waiver", { body: "I accept the risks of training at this gym." })).status, 200);
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/waivers`, { signedName: "Ravi Kumar" })).status, 201);
  let w = await call("GET", `/privacy/members/${m._id}/waivers`);
  assert(w.data.upToDate);
  await call("PUT", "/privacy/waiver", { body: "New wording of the waiver, version two." });
  w = await call("GET", `/privacy/members/${m._id}/waivers`);
  assert(!w.data.upToDate, "new version needs a fresh signature");

  // consent
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/consents`, { purpose: "marketing", granted: false })).status, 201);
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/consents`, { purpose: "nope", granted: true })).status, 400);

  // export decrypts, erase needs the phone
  const ex = await call("GET", `/privacy/members/${m._id}/export`);
  assert.strictEqual(ex.member.medicalNotes, "asthma");
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/erase`, { confirmPhone: "123" })).status, 400);
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/erase`, { confirmPhone: "9876543210" })).status, 200);
  const after = (await call("GET", `/members/${m._id}`)).data;
  assert.strictEqual(after.name, "Erased member");
  assert(!after.email && !after.medicalNotes);
  assert.strictEqual((await call("POST", `/privacy/members/${m._id}/erase`, { confirmPhone: "9876543210" })).status, 400);

  // soft delete: hidden after delete, back after restore
  const t = (await call("POST", "/members", { name: "Temp", phone: "9876543299" })).data;
  assert.strictEqual((await call("DELETE", `/members/${t._id}`)).status, 200);
  assert.strictEqual((await call("GET", `/members/${t._id}`)).status, 404);
  assert((await call("GET", "/trash")).data.members.some((x) => x._id === t._id));
  assert.strictEqual((await call("POST", `/trash/members/${t._id}/restore`)).status, 200);
  assert.strictEqual((await call("GET", `/members/${t._id}`)).status, 200);

  console.log("PRIVACY OK");
  await mongod.stop();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
