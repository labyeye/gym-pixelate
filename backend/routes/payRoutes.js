const express = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("express-async-handler");
const links = require("../utils/paymentLinks");
const { fail } = require("../utils/gym");
const router = express.Router();

// Public (the link token is the credential), so keep it tight.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later." },
});
router.use(limiter);

router.get("/:token", asyncHandler(async (req, res) => {
  const data = await links.details(req.params.token);
  if (!data) throw fail(404, "Payment link not found");
  res.json({ success: true, data });
}));
router.post("/:token/order", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await links.start(req.params.token) });
}));
router.post("/:token/verify", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await links.confirm(req.params.token, req.body) });
}));

module.exports = router;
