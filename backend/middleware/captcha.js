// Cloudflare Turnstile on the public endpoints bots love (register, OTP / reset sends).
// Off until TURNSTILE_SECRET is set. Native apps send x-device-platform and can't show the widget; they
// rely on the rate limits + per-country OTP limit (known gap, see audit).
module.exports = async (req, res, next) => {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret || req.headers["x-device-platform"]) return next();
  const token = req.headers["x-captcha-token"];
  let ok = false;
  if (token) {
    try {
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: String(token), remoteip: req.ip || "" }),
        signal: AbortSignal.timeout(5000),
      });
      ok = !!(await r.json()).success;
    } catch {
      ok = false; // fail closed
    }
  }
  if (!ok) return res.status(400).json({ success: false, code: "CAPTCHA", message: "Please complete the verification and try again." });
  next();
};
