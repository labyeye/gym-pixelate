const mongoose = require("mongoose");

// Tenant-scoped sequence generator (invoice numbers, member codes, receipts...).
const counterSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
counterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const Counter = mongoose.model("Counter", counterSchema);

/** Atomically returns the next number for (tenant, key). Never reuses a number. */
Counter.next = async (tenantId, key) => {
  const doc = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
};

module.exports = Counter;
