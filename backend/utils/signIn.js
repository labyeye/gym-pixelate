const Tenant = require("../models/Tenant");
const Session = require("../models/Session");
const generateToken = require("./generateToken");
const logActivity = require("./activityLogger");
const { sendSecurityAlertEmail } = require("./emailService");
const crypto = require("crypto");

const REFRESH_DAYS = 30;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const COOKIE = "gym_rt";
const readCookie = (req) => (/(?:^|;\s*)gym_rt=([\w-]+)/.exec(req.headers.cookie || "") || [])[1];

// Mints a new opaque refresh token for the session. Browsers get it as an httpOnly cookie, native apps in the body.
async function issueRefresh(req, res, sid) {
  const token = crypto.randomBytes(48).toString("base64url");
  const cur = await Session.findById(sid).select("+refreshHash");
  await Session.updateOne(
    { _id: sid },
    { refreshHash: sha(token), prevRefreshHash: cur?.refreshHash, refreshExpiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) },
  );
  if (req.headers["x-device-platform"]) return token;
  if (res) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.REFRESH_COOKIE_SAMESITE || "lax", // "none" when web and API are on different sites
      path: "/api/auth",
      maxAge: REFRESH_DAYS * 864e5,
    });
  }
  return undefined;
}

function describeFromUserAgent(ua = "") {
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [browser, os && `on ${os}`].filter(Boolean).join(" ") || "Web browser";
}

// Creates the device record for a fresh sign-in and returns its id for the token.
async function startSession(req, user) {
  const platform = String(req.headers["x-device-platform"] || "web").slice(0, 20);
  const deviceName =
    String(req.headers["x-device-name"] || "").trim().slice(0, 80) || describeFromUserAgent(req.headers["user-agent"]);
  // a device we haven't seen for this account (and not the very first sign-in) triggers an email heads-up
  const known = await Session.exists({ userId: user._id, deviceName, platform });
  const any = known || (await Session.exists({ userId: user._id }));
  const s = await Session.create({ userId: user._id, deviceName, platform, ip: req.ip || "" });
  if (any && !known)
    sendSecurityAlertEmail({ to: user.email, name: user.name, what: `New sign-in to your NestGym account from ${deviceName} (${platform}), IP ${req.ip || "unknown"}.` });
  return String(s._id);
}

// What every successful sign-in returns (password, OTP, 2FA, backup code, email code, registration).
async function signInPayload(req, user, status = 200, res) {
  const sid = await startSession(req, user);
  const refreshToken = await issueRefresh(req, res, sid);
  const tenant = user.tenantId
    ? await Tenant.findById(user.tenantId).select("name plan status planExpiresAt onboarded")
    : null;
  return {
    status,
    body: {
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        department: user.department,
        avatar: user.avatar,
        status: user.status,
        tenantId: user.tenantId,
        lastLogin: user.lastLogin,
        emailVerified: !!user.emailVerified,
        phoneVerified: !!user.phoneVerified,
        twoFactorEnabled: !!user.twoFactorEnabled,
        token: generateToken(user._id, sid),
        ...(refreshToken && { refreshToken }),
        tenant: tenant
          ? {
              _id: tenant._id,
              name: tenant.name,
              plan: tenant.plan,
              status: tenant.status,
              onboarded: tenant.onboarded !== false,
            }
          : null,
      },
    },
  };
}

// Records the login, opens a device session and sends the response.
async function completeSignIn(req, res, user) {
  user.failedLogins = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  logActivity({
    user,
    action: "LOGIN",
    module: "Auth",
    description: `${user.name} logged in`,
    ip: req.ip,
  });
  const { status, body } = await signInPayload(req, user, 200, res);
  res.status(status).json(body);
}

// POST /auth/refresh: swaps a valid refresh token for a new access token + a rotated refresh token.
// Replaying an already-rotated token means it leaked, so that device session is killed.
async function refresh(req, res) {
  const fromCookie = readCookie(req);
  if (fromCookie && !req.headers["x-requested-with"]) return res.status(401).json({ success: false, message: "Bad request" });
  const t = fromCookie || req.body?.refreshToken;
  const h = t && sha(String(t));
  const s = h && (await Session.findOne({ $or: [{ refreshHash: h }, { prevRefreshHash: h }] }).select("+refreshHash +prevRefreshHash"));
  if (!s || s.refreshHash !== h) {
    if (s) await s.deleteOne();
    return res.status(401).json({ success: false, message: "Session expired, please sign in again" });
  }
  if (!s.refreshExpiresAt || s.refreshExpiresAt < new Date()) {
    await s.deleteOne();
    return res.status(401).json({ success: false, message: "Session expired, please sign in again" });
  }
  s.lastActiveAt = new Date();
  await s.save();
  const refreshToken = await issueRefresh(req, res, s._id);
  res.json({ success: true, data: { token: generateToken(s.userId, s._id), ...(refreshToken && { refreshToken }) } });
}

module.exports = { startSession, signInPayload, completeSignIn, refresh, issueRefresh };
