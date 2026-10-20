// Nest Gym side of utils/crmAccounts.js.
module.exports = require("./crmTenantAdapter")({
  label: "Gym",
  Tenant: require("../models/Tenant"),
  User: require("../models/User"),
  ownerRole: "gym_owner",
  defaultRole: "receptionist",
  hideRoles: ["member"], // gym members have logins too; they're managed inside the gym app
  limitFields: [
    { key: "members", label: "Member limit", path: "limits.members" },
    { key: "branches", label: "Branch limit", path: "limits.branches" },
    { key: "staff", label: "Staff limit", path: "limits.staff" },
  ],
  defaultLimits: { members: 500, branches: 1, staff: 10 },
  createTenant: (b, { email, phone }) => ({ email, phone: phone || "", onboarded: true }),
  usage: (t, users) => `limits: ${t.limits?.members ?? "—"} members · ${t.limits?.branches ?? "—"} branches · ${users} logins`,
});
