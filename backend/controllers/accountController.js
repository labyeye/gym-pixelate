// "Delete my account" (Google Play / App Store requirement). Needs the current password.
// The login is closed at once and personal details are wiped; invoices and memberships stay because tax law
// requires them and they only point at an anonymised user id. A gym owner's gym data is purged by support
// within 30 days (deletionRequestedAt is the work-list marker).
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Session = require("../models/Session");

const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.matchPassword(String(req.body?.password || "")))) {
    res.status(401);
    throw new Error("Password is incorrect");
  }
  const isOwner = user.role === "gym_owner";
  const set = {
    status: "inactive",
    deletionRequestedAt: new Date(),
    passwordChangedAt: new Date(),
  };
  if (!isOwner) {
    // owners keep name/email until support finishes the gym purge (they may need to export data first)
    Object.assign(set, {
      name: "Deleted user",
      email: `deleted-${user._id}@deleted.invalid`,
      phone: "",
      photo: "",
    });
  }
  await User.updateOne({ _id: user._id }, { $set: set });
  await Session.deleteMany({ userId: user._id });
  res.json({
    success: true,
    message: isOwner
      ? "Account closed. Your gym data will be permanently deleted within 30 days. Write to support@pixelatenest.com to cancel."
      : "Your account has been deleted.",
  });
});

module.exports = { deleteAccount };
