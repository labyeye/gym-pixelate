const { parsePhone } = require("../utils/phone");

// OTP sends cost money and abroad they are the usual SMS/WhatsApp-pumping target, so the
// allowance depends on the destination country. Overridable:
//   OTP_COUNTRY_LIMITS='{"IN":600,"AE":40}'  (sends per hour per country, whole platform)
//   OTP_BLOCKED_COUNTRIES='PK,BD'            (reject outright)
const HOUR = 60 * 60 * 1000;
const DEFAULT_COUNTRY_PER_HOUR = { IN: 600 }; // everyone else: FOREIGN_PER_HOUR
const FOREIGN_PER_HOUR = 30;
const PER_NUMBER = { max: 3, windowMs: 15 * 60 * 1000 };
const PER_IP_FOREIGN = { max: 5, windowMs: HOUR };

const overrides = (() => {
  try {
    return JSON.parse(process.env.OTP_COUNTRY_LIMITS || "{}");
  } catch {
    return {};
  }
})();
const blocked = new Set(
  (process.env.OTP_BLOCKED_COUNTRIES || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);
const countryMax = (iso) =>
  overrides[iso] ?? DEFAULT_COUNTRY_PER_HOUR[iso] ?? FOREIGN_PER_HOUR;

// ponytail: in-memory counters — per process. Move to Redis/Mongo TTL if the API runs on several instances.
const hits = new Map(); // key -> number[] of timestamps
function take(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}
setInterval(
  () => {
    const now = Date.now();
    for (const [k, arr] of hits)
      if (!arr.some((t) => now - t < HOUR)) hits.delete(k);
  },
  10 * 60 * 1000,
).unref();

function otpCountryLimit(req, res, next) {
  const p = parsePhone(req.body?.phone);
  if (!p)
    return res
      .status(400)
      .json({
        success: false,
        message: "Enter a valid phone number with country code",
      });
  const deny = (message) => res.status(429).json({ success: false, message });
  if (blocked.has(p.iso))
    return deny(
      "OTP sign-in is not available for this country. Please use email and password.",
    );
  if (!take(`num:${p.e164}`, PER_NUMBER.max, PER_NUMBER.windowMs))
    return deny(
      "Too many OTP requests for this number. Try again in 15 minutes.",
    );
  if (
    p.iso !== "IN" &&
    !take(`ip:${req.ip}`, PER_IP_FOREIGN.max, PER_IP_FOREIGN.windowMs)
  )
    return deny(
      "Too many international OTP requests from your network. Try again later.",
    );
  if (!take(`cc:${p.iso}`, countryMax(p.iso), HOUR))
    return deny(
      "OTP service is busy for your region. Please try again shortly or use email and password.",
    );
  req.phone = p;
  next();
}

module.exports = { otpCountryLimit };
