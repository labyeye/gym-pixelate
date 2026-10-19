const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { runWithTenant } = require("../utils/tenantScope");
const { ensureBranch } = require("../utils/gym");

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
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401);
    throw new Error("Not authorized");
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    res.status(401);
    throw new Error("Not authorized");
  }

  if (user.status === "inactive") {
    res.status(403);
    throw new Error("Account is deactivated. Contact your administrator.");
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
  // everything downstream (controllers, mongoose hooks) sees this tenant
  runWithTenant(user.tenantId, async () => {
    try {
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
