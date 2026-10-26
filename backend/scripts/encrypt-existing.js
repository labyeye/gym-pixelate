// node scripts/encrypt-existing.js            -> dry run: how many member documents hold plaintext sensitive data
// node scripts/encrypt-existing.js --apply    -> encrypts them in place (safe to re-run; already-encrypted values are skipped)
// node scripts/encrypt-existing.js --apply --decrypt   -> rollback: writes plaintext back (needs the same key)
require("dotenv").config();
const mongoose = require("mongoose");
const { encryptValue, decryptValue, isEncrypted } = require("../utils/fieldCrypt");

const APPLY = process.argv.includes("--apply");
const DECRYPT = process.argv.includes("--decrypt");
const { SENSITIVE_MEMBER_PATHS: PATHS } = require("../utils/fieldCrypt");

const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const xform = (v) => (Array.isArray(v) ? v.map(xform) : DECRYPT ? decryptValue(v) : encryptValue(v));
const dirty = (v) => (Array.isArray(v) ? v.some(dirty) : typeof v === "string" && v !== "" && (DECRYPT ? isEncrypted(v) : !isEncrypted(v)));

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection("members");
  let docs = 0;
  let fields = 0;
  for await (const d of col.find({})) {
    const $set = {};
    for (const p of PATHS) {
      const v = get(d, p);
      if (dirty(v)) $set[p] = xform(v);
    }
    if (!Object.keys($set).length) continue;
    docs++;
    fields += Object.keys($set).length;
    if (APPLY) await col.updateOne({ _id: d._id }, { $set });
  }
  console.log(`${APPLY ? (DECRYPT ? "decrypted" : "encrypted") : "would change"} ${fields} field(s) in ${docs} member document(s)`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
