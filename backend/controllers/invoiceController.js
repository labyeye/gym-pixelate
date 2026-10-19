const asyncHandler = require("express-async-handler");
const Invoice = require("../models/Invoice");
const Membership = require("../models/Membership");
const Setting = require("../models/Setting");
const logActivity = require("../utils/activityLogger");
const {
  fail,
  createInvoice,
  recordPayment,
  refundPayment,
  r2,
  istDay,
} = require("../utils/gym");

const log = (req, action, inv, description) =>
  logActivity({
    user: req.user,
    action,
    module: "Invoice",
    description,
    targetId: inv._id,
    ip: req.ip,
  });
const MEMBER_FIELDS = "name email phone memberCode photo";

const getInvoices = asyncHandler(async (req, res) => {
  const {
    branchId,
    memberId,
    status,
    from,
    to,
    search,
    page = 1,
    limit = 50,
  } = req.query;
  const query = {};
  if (req.user.tenantId) query.tenantId = req.user.tenantId;
  if (branchId) query.branchId = branchId;
  if (memberId) query.memberId = memberId;
  if (status) query.status = status;
  if (search)
    query.invoiceNumber = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  if (from || to) {
    query.issuedAt = {};
    if (from) query.issuedAt.$gte = istDay(from);
    if (to) query.issuedAt.$lte = istDay(to, true);
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [invoices, total, due] = await Promise.all([
    Invoice.find(query)
      .populate("memberId", MEMBER_FIELDS)
      .sort("-issuedAt")
      .skip(skip)
      .limit(parseInt(limit)),
    Invoice.countDocuments(query),
    Invoice.aggregate([
      { $match: { ...query, status: { $in: ["pending", "partial"] } } },
      {
        $group: {
          _id: null,
          due: { $sum: { $subtract: ["$totalAmount", "$paidAmount"] } },
        },
      },
    ]),
  ]);
  res.json({
    success: true,
    count: invoices.length,
    total,
    totalDue: r2(due[0]?.due || 0),
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: invoices,
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate(
    "memberId",
    `${MEMBER_FIELDS} address city state`,
  );
  if (!invoice) throw fail(404, "Invoice not found");
  const company = await Setting.findOne({ tenantId: invoice.tenantId }).lean();
  res.json({
    success: true,
    data: invoice,
    company: company && {
      name: company.companyName,
      address: company.companyAddress,
      phone: company.companyPhone,
      email: company.companyEmail,
      gst: company.companyGST,
      footer: company.invoiceFooter,
      logoUrl: company.logoUrl,
      pan: company.companyPAN,
      website: company.companyWebsite,
      state: company.companyState,
      stateCode: company.companyStateCode,
      bank: { name: company.bankName, accountName: company.bankAccountName, accountNo: company.bankAccountNumber, ifsc: company.bankIFSC, branch: company.bankBranch, type: company.bankAccountType },
      terms: company.invoiceTerms,
      template: company.invoiceTemplate,
      receiptDesign: company.receiptDesign,
    },
  });
});

// Manual / POS-style invoice with line items, discount, coupon and an optional first payment.
const createInvoiceHandler = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.branchId) throw fail(400, "branchId is required");
  let items = b.items;
  if (!items?.length && b.amount !== undefined) {
    // legacy payload {amount, gstAmount}: one line, GST derived from the amounts
    const pct = Number(b.amount)
      ? Math.round(((Number(b.gstAmount) || 0) / Number(b.amount)) * 10000) /
        100
      : 0;
    items = [
      {
        kind: "other",
        description: b.description || "Gym services",
        unitPrice: Number(b.amount),
        gstPercent: pct,
      },
    ];
  }
  for (const i of items || []) {
    if (!i.description || !(Number(i.unitPrice) >= 0))
      throw fail(400, "Every line item needs a description and a price");
    i.unitPrice = Number(i.unitPrice);
    i.quantity = i.quantity === undefined ? 1 : Number(i.quantity);
    if (!(i.quantity > 0))
      throw fail(400, "Quantity must be greater than zero");
  }
  // legacy callers sent no payNow and meant "paid in full" unless status was pending
  const payFull = b.payNow === undefined && b.status !== "pending";
  const out = await createInvoice({
    tenantId: req.user.tenantId,
    branchId: b.branchId,
    memberId: b.memberId || null,
    membershipId: b.membershipId || null,
    items,
    discount: b.discount,
    couponCode: b.couponCode,
    payNow: Number(b.payNow) || 0,
    payFull,
    method: b.paymentMethod || b.method,
    reference: b.reference,
    dueDate: b.dueDate,
    userId: req.user._id,
    notes: b.notes,
    idempotencyKey: b.idempotencyKey,
  });
  log(req, "CREATE", out, `Created invoice ${out.invoiceNumber}`);
  res.status(201).json({ success: true, data: out });
});

const addPayment = asyncHandler(async (req, res) => {
  const { amount, method, reference, idempotencyKey, note } = req.body;
  const inv = await recordPayment(req.user.tenantId, req.params.id, {
    amount: Number(amount),
    method,
    reference,
    idempotencyKey,
    note,
    userId: req.user._id,
  });
  logActivity({
    user: req.user,
    action: "PAYMENT",
    module: "Invoice",
    description: `Collected ₹${amount} on ${inv.invoiceNumber}`,
    targetId: inv._id,
    ip: req.ip,
  });
  res.json({ success: true, data: inv });
});

const refund = asyncHandler(async (req, res) => {
  const { amount, method, reference, note } = req.body;
  const inv = await refundPayment(req.user.tenantId, req.params.id, {
    amount: Number(amount),
    method,
    reference,
    note,
    userId: req.user._id,
  });
  logActivity({
    user: req.user,
    action: "REFUND",
    module: "Invoice",
    description: `Refunded ₹${amount} on ${inv.invoiceNumber}`,
    targetId: inv._id,
    ip: req.ip,
  });
  res.json({ success: true, data: inv });
});

// Money is never edited in place; only notes / due date. Void instead of delete once anything was paid.
const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw fail(404, "Invoice not found");
  if (req.body.notes !== undefined) invoice.notes = req.body.notes;
  if (req.body.dueDate !== undefined)
    invoice.dueDate = req.body.dueDate || undefined;
  await invoice.save();
  log(req, "UPDATE", invoice, `Updated invoice ${invoice.invoiceNumber}`);
  res.json({ success: true, data: invoice });
});

const cancelInvoice = asyncHandler(async (req, res) => {
  const inv = await Invoice.findOneAndUpdate(
    { _id: req.params.id, status: "pending", paidAmount: { $lte: 0 } },
    { $set: { status: "cancelled" } },
    { new: true },
  );
  if (!inv)
    throw fail(
      409,
      "Only an unpaid invoice can be voided. Refund payments first.",
    );
  if (inv.membershipId)
    await Membership.updateOne(
      { _id: inv.membershipId, paidAmount: 0 },
      {
        $set: {
          status: "cancelled",
          cancelReason: "Invoice voided",
          cancelledAt: new Date(),
        },
      },
    );
  log(req, "CANCEL", inv, `Voided invoice ${inv.invoiceNumber}`);
  res.json({ success: true, data: inv });
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw fail(404, "Invoice not found");
  if (invoice.paidAmount > 0 || invoice.payments.length)
    throw fail(
      409,
      "An invoice with payments can't be deleted. Void or refund it instead.",
    );
  await Invoice.deleteOne({ _id: invoice._id });
  log(req, "DELETE", invoice, `Deleted invoice ${invoice.invoiceNumber}`);
  res.json({ success: true, message: "Invoice deleted successfully" });
});

const getInvoicePdf = asyncHandler(async (req, res) => {
  res
    .status(501)
    .json({
      success: false,
      message:
        "Use the browser print view (GET /invoices/:id returns all fields incl. company details)",
    });
});

module.exports = {
  getInvoices,
  getInvoice,
  createInvoice: createInvoiceHandler,
  addPayment,
  refund,
  updateInvoice,
  cancelInvoice,
  deleteInvoice,
  getInvoicePdf,
};
