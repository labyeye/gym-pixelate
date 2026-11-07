const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Member = require("../models/Member");
const { protect } = require("../middleware/auth");

// Today's (IST) birthdays + anniversaries for the gym's owner/team. Staff: birthday + work anniversary
// (trainerProfile.dob / joiningDate). Members: birthday + their anniversary date. Members themselves never see this.
// Queries are tenant-scoped by the tenant-scope plugin (protect runs the request inside runWithTenant).
router.get("/", protect, async (req, res, next) => {
  try {
    if (req.user.role === "member") return res.json({ success: true, data: [] });
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const m = ist.getUTCMonth();
    const d = ist.getUTCDate();
    const y = ist.getUTCFullYear();
    const on = (dt) => dt && new Date(dt).getUTCMonth() === m && new Date(dt).getUTCDate() === d;
    const [staff, members] = await Promise.all([
      User.find({ status: "active", role: { $ne: "member" } }).select("name avatar trainerProfile.dob trainerProfile.joiningDate").lean(),
      Member.find({ status: "active" }).select("name photo dob anniversary").lean(),
    ]);
    const data = [];
    for (const u of staff) {
      const p = u.trainerProfile || {};
      const base = { name: u.name, avatar: u.avatar, who: "Team" };
      if (on(p.dob)) data.push({ ...base, id: `sb-${u._id}`, kind: "birthday", detail: "Birthday today" });
      const yrs = p.joiningDate ? y - new Date(p.joiningDate).getUTCFullYear() : 0;
      if (on(p.joiningDate) && yrs >= 1)
        data.push({ ...base, id: `sa-${u._id}`, kind: "anniversary", detail: `${yrs} year${yrs === 1 ? "" : "s"} with us` });
    }
    for (const mem of members) {
      const base = { name: mem.name, avatar: mem.photo, who: "Member" };
      if (on(mem.dob)) data.push({ ...base, id: `mb-${mem._id}`, kind: "birthday", detail: "Member birthday today" });
      if (on(mem.anniversary)) data.push({ ...base, id: `ma-${mem._id}`, kind: "anniversary", detail: "Member anniversary today" });
    }
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
