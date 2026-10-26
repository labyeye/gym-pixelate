// Refresh-token rotation on a THROWAWAY in-memory database:  node scripts/test-refresh.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const assert = require("assert");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("gymrefresh");
  process.env.JWT_SECRET = "refresh-secret";
  process.env.ENCRYPTION_SECRET = "refresh-enc";
  process.env.PORT = "5098";
  process.env.NODE_ENV = "test";
  require("../server");
  await new Promise((r) => setTimeout(r, 1500));
  const base = "http://127.0.0.1:5098/api";
  const post = (path, body, headers = {}) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body || {}) });

  const reg = await post("/auth/register", {
    name: "Own Er", email: "own@test.dev", password: "Kx7#mQv29!", gymName: "G", phone: "9876543210",
  }, { "x-device-platform": "android" });
  const rj = await reg.json();
  assert(rj.data?.refreshToken, "native client gets refresh token in body: " + JSON.stringify(rj).slice(0, 200));
  const r1 = rj.data.refreshToken;

  const a = await (await post("/auth/refresh", { refreshToken: r1 }, { "x-device-platform": "android" })).json();
  assert(a.data.token && a.data.refreshToken && a.data.refreshToken !== r1, "rotated");

  const replay = await post("/auth/refresh", { refreshToken: r1 }, { "x-device-platform": "android" });
  assert.strictEqual(replay.status, 401, "replayed old token rejected");
  const after = await post("/auth/refresh", { refreshToken: a.data.refreshToken }, { "x-device-platform": "android" });
  assert.strictEqual(after.status, 401, "reuse killed the whole session");

  // owner policy: require 2FA -> app routes refused with 2FA_REQUIRED, /auth still works
  const lg = await (await post("/auth/login", { email: "own@test.dev", password: "Kx7#mQv29!" }, { "x-device-platform": "ios" })).json();
  const H = { Authorization: "Bearer " + lg.data.token, "Content-Type": "application/json", "x-device-platform": "ios" };
  await post("/legal/accept", {}, H);
  const put = await fetch(base + "/settings", { method: "PUT", headers: H, body: JSON.stringify({ require2fa: true }) });
  assert.strictEqual(put.status, 200, "owner can set policy");
  await new Promise((r) => setTimeout(r, 100));
  const blocked = await fetch(base + "/members", { headers: H });
  assert.strictEqual((await blocked.json()).code, "2FA_REQUIRED");
  assert.strictEqual((await fetch(base + "/auth/me", { headers: H })).status, 200, "auth routes stay open");

  const none = await post("/auth/refresh", {});
  assert.strictEqual(none.status, 401);
  console.log("REFRESH OK");
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
