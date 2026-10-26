// node scripts/test-dashboard-charts.js  (in-memory MongoDB: POS revenue + new-membership series for the dashboard graphs)
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const Invoice = require("../models/Invoice");
  const { getDashboardCharts } = require("../controllers/dashboardController");
  const tenantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const mk = (n, issuedAt, items, status = "paid") =>
    Invoice.create({ tenantId, branchId, invoiceNumber: "T-" + n, items, amount: 0, totalAmount: 0, issuedAt, status });
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15, 12);
  await mk(1, today, [{ kind: "product", description: "Whey", quantity: 1, unitPrice: 1000, gstPercent: 18, amount: 1000 }]); // 1180
  await mk(2, today, [{ kind: "membership", description: "Gold", quantity: 1, unitPrice: 5000, gstPercent: 18, amount: 5000 }]); // not POS
  await mk(3, lastMonth, [{ kind: "product", description: "Shaker", quantity: 2, unitPrice: 250, gstPercent: 0, amount: 500 }]);
  await mk(4, today, [{ kind: "product", description: "Void", quantity: 1, unitPrice: 999, gstPercent: 0, amount: 999 }], "cancelled");

  let out;
  await getDashboardCharts({ user: { tenantId } }, { json: (b) => (out = b.data) });
  assert.strictEqual(out.posByDay.length, 30);
  assert.strictEqual(out.posByDay.at(-1).revenue, 1180, "today's POS sale incl. GST; membership + cancelled ignored");
  assert.strictEqual(out.posByMonth.length, 12);
  assert.strictEqual(out.posByMonth.at(-1).revenue, 1180);
  assert.strictEqual(out.posByMonth.at(-2).revenue, 500);
  assert.strictEqual(out.membersByDay.length, 30);
  console.log("dashboard charts OK");
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
