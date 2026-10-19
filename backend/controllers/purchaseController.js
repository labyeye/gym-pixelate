const asyncHandler = require("express-async-handler");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const Expense = require("../models/Expense");
const Invoice = require("../models/Invoice");
const logActivity = require("../utils/activityLogger");
const { fail, nextCode, r2 } = require("../utils/gym");

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const log = (req, action, doc, text) =>
  logActivity({ user: req.user, action, module: "Purchase", description: text, targetId: doc._id, ip: req.ip });

const list = asyncHandler(async (req, res) => {
  const { q, status, vendor, page = 1, limit = 25 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (vendor) query.vendor = vendor;
  if (q)
    query.$or = ["poNumber", "grnNumber", "vendor", "billNumber"].map((f) => ({
      [f]: { $regex: esc(q), $options: "i" },
    }));
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total, vendors] = await Promise.all([
    Purchase.find(query).populate("createdBy", "name").populate("receivedBy", "name").sort("-createdAt").skip(skip).limit(parseInt(limit)),
    Purchase.countDocuments(query),
    Purchase.distinct("vendor", req.user.tenantId ? { tenantId: req.user.tenantId } : {}),
  ]);
  res.json({ success: true, count: data.length, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), vendors, data });
});

const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.vendor?.trim()) throw fail(400, "Vendor is required");
  if (!Array.isArray(b.items) || !b.items.length) throw fail(400, "Add at least one product");
  const items = [];
  for (const l of b.items) {
    const p = await Product.findById(l.productId);
    if (!p) throw fail(404, "Product not found");
    const quantity = Number(l.quantity), unitCost = Number(l.unitCost);
    if (!(quantity > 0) || !(unitCost >= 0)) throw fail(400, `Check quantity / cost for ${p.name}`);
    items.push({ productId: p._id, name: p.name, sku: p.sku, quantity, unitCost, gstPercent: Number(l.gstPercent) || 0 });
  }
  const subtotal = r2(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  const gst = r2(items.reduce((s, i) => s + i.quantity * i.unitCost * (i.gstPercent / 100), 0));
  const doc = await Purchase.create({
    tenantId: req.user.tenantId,
    branchId: b.branchId,
    poNumber: await nextCode(req.user.tenantId, "purchase", "PO", 4),
    vendor: b.vendor,
    vendorPhone: b.vendorPhone,
    billNumber: b.billNumber,
    billDate: b.billDate || undefined,
    billFile: b.billFile || undefined,
    items,
    subtotal,
    gst,
    total: r2(subtotal + gst),
    paidAmount: Math.min(Number(b.paidAmount) || 0, r2(subtotal + gst)),
    notes: b.notes,
    createdBy: req.user._id,
  });
  log(req, "CREATE", doc, `Purchase order ${doc.poNumber} from ${doc.vendor}`);
  res.status(201).json({ success: true, data: doc });
});

// Goods received: issue the GRN, add stock (cost + vendor stamped on each product), book the paid part as an expense.
const receive = asyncHandler(async (req, res) => {
  const doc = await Purchase.findOneAndUpdate(
    { _id: req.params.id, status: "ordered" },
    { status: "received", receivedOn: new Date(), receivedBy: req.user._id },
    { new: true },
  );
  if (!doc) throw fail(409, "Purchase not found or already received / cancelled");
  doc.grnNumber = await nextCode(req.user.tenantId, "grn", "GRN", 4);
  await doc.save();
  for (const i of doc.items)
    await Product.updateOne({ _id: i.productId }, { $inc: { stock: i.quantity }, $set: { costPrice: i.unitCost, vendor: doc.vendor } });
  if (doc.paidAmount > 0)
    await Expense.create({
      tenantId: doc.tenantId,
      branchId: doc.branchId,
      category: "stock purchase",
      amount: doc.paidAmount,
      vendor: doc.vendor,
      description: `${doc.poNumber} / ${doc.grnNumber}${doc.billNumber ? ` / bill ${doc.billNumber}` : ""}`,
      recordedBy: req.user._id,
    });
  log(req, "UPDATE", doc, `Received ${doc.poNumber} as ${doc.grnNumber}`);
  res.json({ success: true, data: doc });
});

const cancel = asyncHandler(async (req, res) => {
  const doc = await Purchase.findOneAndUpdate({ _id: req.params.id, status: "ordered" }, { status: "cancelled" }, { new: true });
  if (!doc) throw fail(409, "Only an order that is not yet received can be cancelled");
  log(req, "UPDATE", doc, `Cancelled ${doc.poNumber}`);
  res.json({ success: true, data: doc });
});

// attach / replace the vendor's bill after the fact
const setBill = asyncHandler(async (req, res) => {
  const doc = await Purchase.findById(req.params.id);
  if (!doc) throw fail(404, "Purchase not found");
  doc.set({ billFile: req.body.billFile, billNumber: req.body.billNumber ?? doc.billNumber });
  await doc.save();
  res.json({ success: true, data: doc });
});

// POS sales history: invoices that contain product lines (who bought, when, what)
const sales = asyncHandler(async (req, res) => {
  const { q, from, to, page = 1, limit = 25 } = req.query;
  const query = { "items.kind": "product" };
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (from || to) query.issuedAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(`${to}T23:59:59.999Z`) }) };
  if (q) query.invoiceNumber = { $regex: esc(q), $options: "i" };
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    Invoice.find(query).populate("memberId", "name phone memberCode photo").populate("createdBy", "name").sort("-issuedAt").skip(skip).limit(parseInt(limit)),
    Invoice.countDocuments(query),
  ]);
  res.json({ success: true, count: data.length, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), data });
});

module.exports = { list, create, receive, cancel, setBill, sales };
