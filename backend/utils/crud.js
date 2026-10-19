const asyncHandler = require("express-async-handler");
const logActivity = require("./activityLogger");
const { fail } = require("./gym");

const PROTECTED = ["_id", "tenantId", "createdAt", "updatedAt", "__v"];
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tenant-scoped CRUD for the simple gym resources.
 * opts: { module, label, search: [fields], filters: [queryParams copied to the query], populate: [[path, select]],
 *         sort, beforeCreate(req, body), beforeSave(doc, req) }
 * Tenant scoping on reads/updates/deletes comes from the mongoose plugin; creates stamp tenantId here.
 */
function crud(Model, opts = {}) {
  const {
    module: mod,
    search = [],
    filters = [],
    populate = [],
    sort = "-createdAt",
    beforeCreate,
    beforeSave,
  } = opts;
  const clean = (b) =>
    Object.fromEntries(
      Object.entries(b || {}).filter(([k]) => !PROTECTED.includes(k)),
    );
  const pop = (q) => populate.reduce((acc, p) => acc.populate(...p), q);
  const log = (req, action, doc, text) =>
    mod &&
    logActivity({
      user: req.user,
      action,
      module: mod,
      description: text,
      targetId: doc._id,
      ip: req.ip,
    });

  const list = asyncHandler(async (req, res) => {
    const { branchId, q, page = 1, limit = 50 } = req.query;
    const query = {};
    if (req.user.tenantId) query.tenantId = req.user.tenantId;
    if (branchId && Model.schema.path("branchId")) query.branchId = branchId;
    for (const f of filters)
      if (req.query[f] !== undefined && req.query[f] !== "")
        query[f] = req.query[f];
    if (q && search.length)
      query.$or = search.map((f) => ({
        [f]: { $regex: esc(q), $options: "i" },
      }));
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      pop(Model.find(query)).sort(sort).skip(skip).limit(parseInt(limit)),
      Model.countDocuments(query),
    ]);
    res.json({
      success: true,
      count: data.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data,
    });
  });

  const get = asyncHandler(async (req, res) => {
    const doc = await pop(Model.findById(req.params.id));
    if (!doc) throw fail(404, `${mod || "Record"} not found`);
    res.json({ success: true, data: doc });
  });

  const create = asyncHandler(async (req, res) => {
    if (!req.user.tenantId) throw fail(400, "A gym account is required");
    const body = clean(req.body);
    if (beforeCreate) await beforeCreate(req, body);
    const doc = new Model({ ...body, tenantId: req.user.tenantId });
    if (beforeSave) await beforeSave(doc, req);
    await doc.save();
    log(
      req,
      "CREATE",
      doc,
      `Created ${mod || "record"} ${doc.name || doc.title || doc.code || doc.number || doc._id}`,
    );
    res.status(201).json({ success: true, data: doc });
  });

  const update = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw fail(404, `${mod || "Record"} not found`);
    doc.set(clean(req.body));
    if (beforeSave) await beforeSave(doc, req);
    await doc.save();
    log(
      req,
      "UPDATE",
      doc,
      `Updated ${mod || "record"} ${doc.name || doc.title || doc.code || doc.number || doc._id}`,
    );
    res.json({ success: true, data: doc });
  });

  const remove = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw fail(404, `${mod || "Record"} not found`);
    await Model.deleteOne({ _id: doc._id });
    log(
      req,
      "DELETE",
      doc,
      `Deleted ${mod || "record"} ${doc.name || doc.title || doc.code || doc.number || doc._id}`,
    );
    res.json({ success: true, message: "Deleted successfully" });
  });

  return { list, get, create, update, remove };
}

module.exports = { crud };
