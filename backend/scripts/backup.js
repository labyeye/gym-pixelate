// Logical backup of the whole database: one gzipped JSON-lines file per collection.
//   node scripts/backup.js [outDir]        (default: ./backups/<timestamp>)
//   node scripts/backup.js --restore <dir> [--apply] [--force]
// Restore is a dry run unless --apply, and refuses to write into a collection that already has data unless --force.
// Encrypted fields are copied as stored (ciphertext), so restoring needs the same FIELD_ENCRYPTION_KEY / JWT_SECRET.
// This is a safety net for small gyms; for production also enable Atlas continuous backup (point-in-time recovery).
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const positional = args.filter((a) => !a.startsWith("--"));

async function backup(db, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.")) continue;
    const out = zlib.createGzip();
    out.pipe(fs.createWriteStream(path.join(dir, `${name}.jsonl.gz`)));
    let n = 0;
    for await (const doc of db.collection(name).find({})) {
      out.write(EJSON.stringify(doc, { relaxed: false }) + "\n");
      n++;
    }
    await new Promise((r) => out.end(r));
    console.log(`${name}: ${n}`);
    total += n;
  }
  console.log(`Backed up ${total} documents to ${dir}`);
}

async function restore(db, dir, apply, force) {
  let total = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl.gz"))) {
    const name = file.replace(".jsonl.gz", "");
    const col = db.collection(name);
    if (apply && !force && (await col.estimatedDocumentCount()) > 0) {
      console.log(`${name}: skipped, collection already has data (use --force to overwrite)`);
      continue;
    }
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)).pipe(zlib.createGunzip()) });
    let batch = [];
    let n = 0;
    const flush = async () => {
      if (apply && batch.length)
        await col.bulkWrite(batch.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })));
      batch = [];
    };
    for await (const line of rl) {
      if (!line) continue;
      batch.push(EJSON.parse(line, { relaxed: false }));
      n++;
      if (batch.length >= 500) await flush();
    }
    await flush();
    console.log(`${name}: ${n}${apply ? "" : " (dry run)"}`);
    total += n;
  }
  console.log(`${apply ? "Restored" : "Would restore"} ${total} documents`);
}

module.exports = { backup, restore };

if (require.main === module) {
  (async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not set");
    const client = await MongoClient.connect(uri);
    const db = client.db();
    if (flag("--restore")) await restore(db, positional[0], flag("--apply"), flag("--force"));
    else await backup(db, positional[0] || path.join(__dirname, "../backups", new Date().toISOString().replace(/[:.]/g, "-")));
    await client.close();
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
