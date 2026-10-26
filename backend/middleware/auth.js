const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const terms = require("../utils/terms");
const { runWithTenant } = require("../utils/tenantScope");
const { ensureBranch } = require("../utils/gym");
const Session = require("../models/Session");
const { mustSetup2fa } = require("../utils/twoFaPolicy");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    res.status(401);
    throw new Error("Not authorized");
  }
  if (decoded.purpose) {
    res.status(401); // 2FA pending tokens are not sessions
    throw new Error("Not authorized");
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    res.status(401);
    throw new Error("Not authorized");
  }

  // a password change/reset logs out every older session (2s slack: iat is whole seconds)
  if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime() - 2000) {
    res.status(401);
    throw new Error("Not authorized");
  }

  if (user.status === "inactive") {
    res.status(403);
    throw new Error("Account is deactivated. Contact your administrator.");
  }

  // Tokens issued to a device carry its session id; a signed-out device is rejected here.
  if (decoded.sid) {
    const session = await Session.findOne({ _id: decoded.sid, userId: user._id }).select("lastActiveAt");
    if (!session) {
      res.status(401);
      throw new Error("This device was signed out. Please log in again.");
    }
    if (Date.now() - session.lastActiveAt.getTime() > 5 * 60 * 1000) {
      Session.updateOne({ _id: session._id }, { lastActiveAt: new Date(), ip: req.ip || "" }).catch(() => {});
    }
    req.sessionId = String(session._id);
  }

  // members may only use the portal (and change their own password / read their profile)
  if (
    user.role === "member" &&
    !/^\/api\/(portal|auth)(\/|\?|$)/.test(req.originalUrl)
  ) {
    res.status(403);
    throw new Error("This area is for gym staff");
  }

  req.user = user;
  if (terms.blocks(req)) return terms.refuse(res);
  // everything downstream (controllers, mongoose hooks) sees this tenant
  runWithTenant(user.tenantId, async () => {
    try {
      if (!/^\/api\/(auth|legal)(\/|\?|$)/.test(req.originalUrl) && (await mustSetup2fa(user)))
        return res.status(403).json({ success: false, code: "2FA_REQUIRED", message: "Your gym requires two-factor authentication. Turn it on in Security to continue." });
      await ensureBranch(req);
      next();
    } catch (e) {
      next(e);
    }
  });
});

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error("You do not have permission to perform this action");
    }
    next();
  };
};

module.exports = { protect, authorize };
