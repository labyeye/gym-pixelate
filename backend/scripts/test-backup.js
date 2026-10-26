// Backup -> restore round trip on THROWAWAY in-memory databases:  node scripts/test-backup.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const { MongoClient, ObjectId } = require("mongodb");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { backup, restore } = require("./backup");

(async () => {
  const mongod = await MongoMemoryServer.create();
  const client = await MongoClient.connect(mongod.getUri());
  const src = client.db("src");
  const dst = client.db("dst");
  const id = new ObjectId();
  await src.collection("members").insertMany([{ _id: id, name: "Ravi", joined: new Date("2026-01-02T03:04:05Z"), n: 7, tags: ["a"] }, { name: "Sita", ref: id }]);
  await src.collection("settings").insertOne({ company: "G", enc: "enc1:abc" });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gymbackup-"));
  await backup(src, dir);
  await restore(dst, dir, false, false);
  assert.strictEqual(await dst.collection("members").countDocuments(), 0, "dry run writes nothing");
  await restore(dst, dir, true, false);
  const back = await dst.collection("members").findOne({ _id: id });
  assert(back.joined instanceof Date && back.joined.toISOString() === "2026-01-02T03:04:05.000Z");
  assert.strictEqual(await dst.collection("members").countDocuments(), 2);
  assert((await dst.collection("members").findOne({ name: "Sita" })).ref.equals(id), "ObjectId preserved");
  await restore(dst, dir, true, false); // existing data: skipped
  assert.strictEqual(await dst.collection("members").countDocuments(), 2);

  fs.rmSync(dir, { recursive: true, force: true });
  await client.close();
  await mongod.stop();
  console.log("BACKUP OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
