const jwt = require("jsonwebtoken");

// `sid` ties the token to a device row in Session so that device can be signed out remotely.
const generateToken = (id, sid) =>
  jwt.sign({ id, ...(sid && { sid: String(sid) }) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "15m",
    algorithm: "HS256",
  });

// Proof that the password step succeeded, spent on /auth/2fa/verify. Never a session: `protect` rejects any
// token that carries a `purpose` claim.
const generatePendingToken = (id) =>
  jwt.sign({ id, purpose: "2fa" }, process.env.JWT_SECRET, { expiresIn: "5m", algorithm: "HS256" });

const verifyPendingToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  if (decoded.purpose !== "2fa") throw new Error("Wrong token purpose");
  return decoded;
};

module.exports = generateToken;
module.exports.generatePendingToken = generatePendingToken;
module.exports.verifyPendingToken = verifyPendingToken;
