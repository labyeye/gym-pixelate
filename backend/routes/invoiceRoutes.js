const express = require("express");
const router = express.Router();
const c = require("../controllers/invoiceController");
const { protect } = require("../middleware/auth");
const { checkPermission } = require("../middleware/checkPermission");

router.use(protect);

router
  .route("/")
  .get(checkPermission("Invoices", "read"), c.getInvoices)
  .post(checkPermission("Invoices", "create"), c.createInvoice);

router.get("/:id/pdf", checkPermission("Invoices", "read"), c.getInvoicePdf);
router.post(
  "/:id/payments",
  checkPermission("Invoices", "create"),
  c.addPayment,
);
router.post("/:id/refund", checkPermission("Invoices", "delete"), c.refund);
router.post(
  "/:id/cancel",
  checkPermission("Invoices", "delete"),
  c.cancelInvoice,
);

router
  .route("/:id")
  .get(checkPermission("Invoices", "read"), c.getInvoice)
  .put(checkPermission("Invoices", "update"), c.updateInvoice)
  .delete(checkPermission("Invoices", "delete"), c.deleteInvoice);

module.exports = router;
