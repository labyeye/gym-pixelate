const crypto = require("crypto");

// Files under /uploads are private: JSON responses carry short-lived signed links, the static handler checks them.
// Stored values stay plain (/uploads/<file>); the signature is added on the way out and stripped on the way in.
const TTL_MS = 12 * 3600 * 1000;
const sig = (name, exp) =>
  crypto.createHmac("sha256", `${process.env.JWT_SECRET}:uploads`).update(`${name}.${exp}`).digest("hex").slice(0, 32);

const NAME = /(\/uploads\/)([\w.-]+)(?:\?e=\d+&(?:amp;)?s=[0-9a-f]+)?/g;
const signText = (text) =>
  text.replace(NAME, (_, p, name) => {
    const exp = Date.now() + TTL_MS;
    return `${p}${name}?e=${exp}&s=${sig(name, exp)}`;
  });
const stripText = (text) => text.replace(NAME, "$1$2");

// res.json -> signed links
function signResponses(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    const text = JSON.stringify(body);
    if (!text || !text.includes("/uploads/")) return json(body);
    res.type("json");
    return res.send(signText(text));
  };
  next();
}

// request bodies -> plain links (a client echoes back what it was given)
function stripRequest(req, res, next) {
  if (req.body && typeof req.body === "object") {
    const text = JSON.stringify(req.body);
    if (text.includes("/uploads/")) req.body = JSON.parse(stripText(text));
  }
  next();
}

// guards express.static for /uploads
function verifyUpload(req, res, next) {
  const name = decodeURIComponent(req.path.slice(1));
  const exp = Number(req.query.e);
  const ok = req.query.s && exp > Date.now() && crypto.timingSafeEqual(Buffer.from(sig(name, exp)), Buffer.from(String(req.query.s).padEnd(32, "x").slice(0, 32)));
  if (!ok) return res.status(403).json({ success: false, message: "Link expired" });
  next();
}

module.exports = { signResponses, stripRequest, verifyUpload, signText, stripText };
