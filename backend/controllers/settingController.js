const asyncHandler = require("express-async-handler");
const Setting = require("../models/Setting");
const { invalidatePermissionsCache } = require("../middleware/checkPermission");
const { encrypt } = require("../utils/encryption");
const { sanitizeInvoiceTemplate } = require("../utils/invoiceTemplate");

// keep in sync with frontend/src/config/modules.ts
const MODULE_KEYS = ["pos", "personalTraining", "classes", "workoutDiet", "bodyProgress", "enquiries", "lockers", "coupons", "expenses", "staffPayroll", "equipment", "announcements", "faceKiosk"];
const sanitizeModules = (m) =>
  Object.fromEntries(MODULE_KEYS.filter((k) => m && typeof m[k] === "boolean").map((k) => [k, m[k]]));

// razorpayKeySecret (plain, write-only) -> razorpayKeySecretEnc; a client can never set the encrypted field directly
const prepare = (body) => {
  const { razorpayKeySecret, razorpayKeySecretEnc, ...rest } = body || {};
  if (razorpayKeySecret)
    rest.razorpayKeySecretEnc = encrypt(String(razorpayKeySecret).trim());
  return rest;
};
const safe = (doc) => {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o.razorpayKeySecretEnc;
  return o;
};

const getSettings = asyncHandler(async (req, res) => {
  const tenantFilter = { tenantId: req.user.tenantId || null };
  let setting = await Setting.findOne(tenantFilter);

  if (!setting) {
    setting = await Setting.create(tenantFilter);
  }

  const hasSecret = !!(
    await Setting.findOne(tenantFilter).select("+razorpayKeySecretEnc")
  )?.razorpayKeySecretEnc;
  res.json({
    success: true,
    data: { ...safe(setting), razorpaySecretSaved: hasSecret },
  });
});

const updateSettings = asyncHandler(async (req, res) => {
  const tenantFilter = { tenantId: req.user.tenantId || null };
  if (req.body && "modules" in req.body) req.body.modules = sanitizeModules(req.body.modules);
  if (req.body && req.body.invoiceTemplate != null) {
    try {
      req.body.invoiceTemplate = sanitizeInvoiceTemplate(req.body.invoiceTemplate);
    } catch (err) {
      res.status(err.statusCode || 400);
      throw err;
    }
  }
  let setting = await Setting.findOne(tenantFilter);

  if (!setting) {
    setting = await Setting.create({ ...prepare(req.body), ...tenantFilter });
  } else {
    setting = await Setting.findOneAndUpdate(tenantFilter, prepare(req.body), {
      new: true,
      runValidators: true,
    });
  }

  invalidatePermissionsCache(req.user.tenantId);

  const hasSecret = !!(
    await Setting.findOne(tenantFilter).select("+razorpayKeySecretEnc")
  )?.razorpayKeySecretEnc;
  res.json({
    success: true,
    data: { ...safe(setting), razorpaySecretSaved: hasSecret },
  });
});

module.exports = {
  getSettings,
  updateSettings,
};
