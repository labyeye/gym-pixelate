const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const User = require("../models/User");
const { completeSignIn } = require("../utils/signIn");
const { assertNewPassword, finishPasswordReset } = require("./securityController");

const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};
// The passkey is bound to this domain. For one passkey on web + mobile use a parent
// domain of the web app (e.g. pixelatenest.com) and host the iOS association file there.
const RP_ID =
  process.env.PASSKEY_RP_ID ||
  hostOf(process.env.FRONTEND_URL) ||
  "localhost";
const RP_NAME = "NestGym";
const ORIGINS = [
  `https://${RP_ID}`,
  process.env.FRONTEND_URL,
  ...(process.env.ALLOWED_ORIGINS || "").split(","),
  ...(process.env.PASSKEY_ORIGINS || "").split(","),
]
  .map((o) => (o || "").trim())
  .filter(Boolean);

// Challenges are stateless: a short-lived signed token the client echoes back.
const signChallenge = (challenge, purpose, uid) =>
  jwt.sign({ challenge, purpose, uid }, process.env.JWT_SECRET, {
    expiresIn: "5m",
    algorithm: "HS256",
  });

const readChallenge = (res, token, purpose) => {
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (p.purpose === purpose) return p;
  } catch {
    /* fall through */
  }
  res.status(400);
  throw new Error("Passkey request expired. Please try again.");
};

const registerOptions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+passkeys");
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(String(user._id)),
    attestationType: "none",
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });
  res.json({
    success: true,
    data: {
      ...options,
      challengeToken: signChallenge(options.challenge, "register", user._id),
    },
  });
});

const registerVerify = asyncHandler(async (req, res) => {
  const { challengeToken, name, ...credential } = req.body;
  const c = readChallenge(res, challengeToken, "register");
  if (String(c.uid) !== String(req.user._id)) {
    res.status(400);
    throw new Error("Passkey request does not match this account");
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: c.challenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
  } catch (e) {
    console.error("[Passkey] registration verify failed:", e.message);
    res.status(400);
    throw new Error(`Passkey could not be verified: ${e.message}`);
  }
  if (!verification.verified) {
    res.status(400);
    throw new Error("Passkey could not be verified");
  }

  const { credential: cred } = verification.registrationInfo;
  const user = await User.findById(req.user._id).select("+passkeys");
  if (user.passkeys.some((p) => p.credentialId === cred.id)) {
    res.status(409);
    throw new Error("This passkey is already registered");
  }
  user.passkeys.push({
    credentialId: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString("base64url"),
    counter: cred.counter,
    transports: cred.transports || [],
    name: String(name || "").trim().slice(0, 60) || "Passkey",
  });
  await user.save();
  res.json({ success: true, message: "Passkey added" });
});

const listPasskeys = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+passkeys");
  res.json({
    success: true,
    data: user.passkeys.map((p) => ({
      _id: p._id,
      name: p.name,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt || null,
    })),
  });
});

const deletePasskey = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+passkeys");
  const before = user.passkeys.length;
  user.passkeys = user.passkeys.filter((p) => String(p._id) !== req.params.id);
  if (user.passkeys.length === before) {
    res.status(404);
    throw new Error("Passkey not found");
  }
  await user.save();
  res.json({ success: true, message: "Passkey removed" });
});

const authOptions = (purpose, userVerification) =>
  asyncHandler(async (req, res) => {
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification,
    });
    res.json({
      success: true,
      data: {
        ...options,
        challengeToken: signChallenge(options.challenge, purpose),
      },
    });
  });

// Discoverable-credential flow: no email needed, the passkey identifies the user.
const loginOptions = authOptions("login", "preferred");
const resetOptions = authOptions("reset", "required");

function assertSignInAllowed(res, user) {
  if (user.status === "inactive") {
    res.status(403);
    throw new Error("Account is deactivated. Contact your administrator.");
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    res.status(429);
    throw new Error("Account locked after too many wrong passwords. Sign in with a WhatsApp code to unlock it.");
  }
}

async function verifyAssertion(res, assertion, challenge, requireUserVerification) {
  const user = await User.findOne({ "passkeys.credentialId": assertion.id }).select("+passkeys +password");
  const stored = user?.passkeys.find((p) => p.credentialId === assertion.id);
  if (!user || !stored) {
    res.status(401);
    throw new Error("Passkey not recognised. Sign in another way.");
  }
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, "base64url"),
        counter: stored.counter,
        transports: stored.transports,
      },
    });
  } catch (e) {
    console.error("[Passkey] assertion verify failed:", e.message);
    res.status(401);
    throw new Error("Passkey verification failed");
  }
  if (!verification.verified) {
    res.status(401);
    throw new Error("Passkey verification failed");
  }
  stored.counter = verification.authenticationInfo.newCounter;
  stored.lastUsedAt = new Date();
  return user;
}

const loginVerify = asyncHandler(async (req, res) => {
  const { challengeToken, ...assertion } = req.body;
  const c = readChallenge(res, challengeToken, "login");
  const user = await verifyAssertion(res, assertion, c.challenge, false);
  assertSignInAllowed(res, user);
  await completeSignIn(req, res, user);
});

const resetVerify = asyncHandler(async (req, res) => {
  const { challengeToken, password, ...assertion } = req.body;
  assertNewPassword(res, password);
  const c = readChallenge(res, challengeToken, "reset");
  const user = await verifyAssertion(res, assertion, c.challenge, true);
  user.password = password;
  await finishPasswordReset(res, user);
});

module.exports = {
  registerOptions,
  registerVerify,
  listPasskeys,
  deletePasskey,
  loginOptions,
  loginVerify,
  resetOptions,
  resetVerify,
};
