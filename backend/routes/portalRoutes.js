const express = require("express");
const router = express.Router();
const c = require("../controllers/portalController");
const { protect } = require("../middleware/auth");

// Member-only area. `protect` already refuses members everywhere else; each handler re-checks role === "member".
router.use(protect);

router.get("/overview", c.overview);
router.get("/invoices", c.invoices);
router.get("/plans", c.plans);
router.post("/measurements", c.addMeasurement);
router.get("/classes/sessions", c.sessions);
router.get("/classes/mine", c.myBookings);
router.post("/classes/book", c.book);
router.post("/classes/pay-order", c.classPayOrder);
router.post("/classes/pay-verify", c.classPayVerify);
router.post("/classes/bookings/:id/cancel", c.cancelBooking);
router.get("/announcements", c.announcements);
router.post("/invoices/:id/pay", c.createPayOrder);
router.post("/invoices/:id/verify", c.verifyPayment);

module.exports = router;
