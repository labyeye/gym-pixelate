const { AsyncLocalStorage } = require("async_hooks");

/*
 * Root-cause fix for cross-gym data access: controllers look records up with findById(req.params.id)
 * and never added tenantId, so gym A could read/edit/delete gym B's members, invoices, plans...
 * `protect` stores the caller's tenant in AsyncLocalStorage; this plugin then forces
 * `tenantId = <caller's tenant>` onto every query of every tenant-owned model.
 * Background jobs and super_admin (no tenant in the store) are intentionally unfiltered.
 * Aggregations bypass query hooks and still have to be scoped by hand.
 */
const als = new AsyncLocalStorage();

const OPS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "countDocuments",
];

function tenantScopePlugin(schema) {
  if (!schema.path("tenantId")) return;
  schema.pre(OPS, function () {
    const tenantId = als.getStore()?.tenantId;
    if (!tenantId) return;
    const f = this.getFilter();
    if (f.tenantId === undefined) this.where({ tenantId });
  });
  // mass-assignment guard: a body like { tenantId: <other gym> } must not be able to move a record
  schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
    if (!als.getStore()?.tenantId) return;
    const u = this.getUpdate();
    if (!u) return;
    delete u.tenantId;
    if (u.$set) delete u.$set.tenantId;
  });
}

const runWithTenant = (tenantId, fn) =>
  als.run({ tenantId: tenantId ? String(tenantId) : null }, fn);

module.exports = { tenantScopePlugin, runWithTenant };
