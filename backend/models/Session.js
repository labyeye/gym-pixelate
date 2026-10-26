const mongoose = require("mongoose");

// One row per signed-in device. Tokens carry the session id (`sid`); deleting
// the row makes `protect` reject that device's next request.
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deviceName: { type: String, default: "Unknown device" },
    platform: { type: String, default: "web" },
    ip: { type: String, default: "" },
    lastActiveAt: { type: Date, default: Date.now },
    // sha256 of the opaque refresh token; the previous one is kept to spot a replayed (stolen) token
    refreshHash: { type: String, select: false },
    prevRefreshHash: { type: String, select: false },
    refreshExpiresAt: Date,
  },
  { timestamps: true },
);

// Drop sessions nobody has used for 90 days.
sessionSchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);
