const Setting = require("../models/Setting");

const ROLES = new Set(["gym_owner", "branch_manager"]);
const cache = new Map(); // tenantId -> { v, t }

// True when this gym requires 2FA for owners/managers and the user hasn't set it up yet.
async function mustSetup2fa(user) {
  if (!ROLES.has(user.role) || user.twoFactorEnabled || !user.tenantId) return false;
  const k = String(user.tenantId);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 60_000) return hit.v;
  const s = await Setting.findOne({ tenantId: user.tenantId }).select("require2fa").lean();
  cache.set(k, { v: !!s?.require2fa, t: Date.now() });
  return !!s?.require2fa;
}
const clearPolicyCache = (tenantId) => cache.delete(String(tenantId));

module.exports = { mustSetup2fa, clearPolicyCache };
