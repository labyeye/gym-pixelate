const ActivityLog = require("../models/ActivityLog");

function logActivity({ user, action, module, description, targetId, ip } = {}) {
  (async () => {
    try {
      await ActivityLog.create({
        user: user?._id || null,
        userName: user?.name || "Anonymous",
        userEmail: user?.email || "",
        userRole: user?.role || "",
        tenantId: user?.tenantId || null,
        action,
        module,
        description,
        targetId: targetId ? String(targetId) : undefined,
        ip,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("[ActivityLogger] Failed to write log:", err.message);
    }
  })();
}

module.exports = logActivity;
