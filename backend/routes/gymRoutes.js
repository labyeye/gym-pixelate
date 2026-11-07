const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { checkPermission: can } = require("../middleware/checkPermission");
const { crud } = require("../utils/crud");
const classes = require("../controllers/classController");
const pt = require("../controllers/ptController");
const ops = require("../controllers/opsController");
const { getMemberOverview } = require("../controllers/memberController");
const staff = require("../controllers/staffController");
const self = require("../controllers/staffSelfController");
const memAtt = require("../controllers/memberAttendanceController");
const face = require("../controllers/attendanceFaceController");
const leave = require("../controllers/staffLeaveController");
const multer = require("multer");
// photos for face checks are read straight from memory and never stored
const photo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, f, cb) =>
    cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
}).single("photo");

const GymClass = require("../models/GymClass");
const WorkoutPlan = require("../models/WorkoutPlan");
const DietPlan = require("../models/DietPlan");
const BodyMeasurement = require("../models/BodyMeasurement");
const Locker = require("../models/Locker");
const Product = require("../models/Product");
const Expense = require("../models/Expense");
const Coupon = require("../models/Coupon");
const Announcement = require("../models/Announcement");
const Equipment = require("../models/Equipment");
const { nextCode } = require("../utils/gym");

/** Mounts list/get/create/update/delete for one resource under `path`, each guarded by `resource` permissions. */
function mount(path, resource, h, extra) {
  const r = express.Router();
  r.use(protect);
  if (extra) extra(r);
  r.route("/")
    .get(can(resource, "read"), h.list)
    .post(can(resource, "create"), h.create);
  r.route("/:id")
    .get(can(resource, "read"), h.get)
    .put(can(resource, "update"), h.update)
    .delete(can(resource, "delete"), h.remove);
  router.use(path, r);
}

const stamp = (field) => (req, body) => {
  body[field] = req.user._id;
};

// classes: specific routes first, then generic CRUD
router.get(
  "/classes/sessions",
  protect,
  can("Classes", "read"),
  classes.getSessions,
);
router.get(
  "/classes/roster",
  protect,
  can("Classes", "read"),
  classes.getRoster,
);
router.post(
  "/classes/book",
  protect,
  can("Classes", "create"),
  classes.bookClass,
);
router.post(
  "/classes/bookings/:id/cancel",
  protect,
  can("Classes", "update"),
  classes.cancelBooking,
);
router.post(
  "/classes/bookings/:id/mark",
  protect,
  can("Classes", "update"),
  classes.markAttendance,
);
mount(
  "/classes",
  "Classes",
  crud(GymClass, {
    module: "Class",
    search: ["name"],
    filters: ["category", "isActive"],
    populate: [["trainerId", "name"]],
    sort: "name",
  }),
);

router.get(
  "/pt/commission",
  protect,
  can("PersonalTraining", "read"),
  pt.commissionReport,
);
router.get("/pt", protect, can("PersonalTraining", "read"), pt.getPackages);
router.post(
  "/pt",
  protect,
  can("PersonalTraining", "create"),
  pt.createPackage,
);
router.get("/pt/:id", protect, can("PersonalTraining", "read"), pt.getPackage);
router.post(
  "/pt/:id/sessions",
  protect,
  can("PersonalTraining", "update"),
  pt.scheduleSession,
);
router.patch(
  "/pt/:id/sessions/:sessionId",
  protect,
  can("PersonalTraining", "update"),
  pt.updateSession,
);

mount(
  "/workout-plans",
  "WorkoutPlans",
  crud(WorkoutPlan, {
    module: "Plan",
    search: ["name"],
    filters: ["memberId", "isTemplate", "status", "goal"],
    populate: [
      ["memberId", "name memberCode photo phone"],
      ["trainerId", "name"],
    ],
  }),
  (r) => {
    r.use((req, _res, next) => {
      if (req.method === "POST" && req.user.role === "trainer")
        req.body.trainerId = req.user._id;
      next();
    });
  },
);
mount(
  "/diet-plans",
  "WorkoutPlans",
  crud(DietPlan, {
    module: "Plan",
    search: ["name"],
    filters: ["memberId", "isTemplate", "status", "goal"],
    populate: [
      ["memberId", "name memberCode photo phone"],
      ["trainerId", "name"],
    ],
  }),
);
mount(
  "/measurements",
  "Measurements",
  crud(BodyMeasurement, {
    module: "Measurement",
    filters: ["memberId"],
    populate: [["memberId", "name memberCode photo"]],
    sort: "-measuredAt",
    beforeCreate: stamp("recordedBy"),
  }),
);

router.post(
  "/lockers/:id/assign",
  protect,
  can("Lockers", "update"),
  ops.assignLocker,
);
router.post(
  "/lockers/:id/release",
  protect,
  can("Lockers", "update"),
  ops.releaseLocker,
);
mount(
  "/lockers",
  "Lockers",
  crud(Locker, {
    module: "Locker",
    search: ["number"],
    filters: ["status", "zone"],
    populate: [["memberId", "name phone memberCode"]],
    sort: "number",
  }),
);

const purchases = require("../controllers/purchaseController");
router.get(
  "/products/sales",
  protect,
  can("Products", "read"),
  purchases.sales,
);
router.get("/purchases", protect, can("Products", "read"), purchases.list);
router.post("/purchases", protect, can("Products", "create"), purchases.create);
router.post(
  "/purchases/:id/receive",
  protect,
  can("Products", "update"),
  purchases.receive,
);
router.post(
  "/purchases/:id/cancel",
  protect,
  can("Products", "update"),
  purchases.cancel,
);
router.put(
  "/purchases/:id/bill",
  protect,
  can("Products", "update"),
  purchases.setBill,
);
router.post("/products/sell", protect, can("Products", "create"), ops.sell);
router.post(
  "/products/:id/stock",
  protect,
  can("Products", "update"),
  ops.adjustStock,
);
mount(
  "/products",
  "Products",
  crud(Product, {
    module: "Product",
    search: ["name", "sku", "vendor"],
    filters: ["category", "isActive"],
    sort: "name",
    beforeCreate: async (req, body) => {
      if (!body.sku)
        body.sku = await nextCode(req.user.tenantId, "product", "PRD", 4);
    },
  }),
);

mount(
  "/expenses",
  "Expenses",
  crud(Expense, {
    module: "Expense",
    search: ["vendor", "description"],
    filters: ["category"],
    sort: "-paidOn",
    beforeCreate: stamp("recordedBy"),
  }),
);
mount(
  "/coupons",
  "Coupons",
  crud(Coupon, {
    module: "Coupon",
    search: ["code", "description"],
    filters: ["isActive"],
  }),
);

router.get(
  "/announcements/active",
  protect,
  can("Announcements", "read"),
  ops.activeAnnouncements,
);
mount(
  "/announcements",
  "Announcements",
  crud(Announcement, {
    module: "Announcement",
    search: ["title"],
    sort: "-pinned -publishAt",
    beforeCreate: stamp("createdBy"),
  }),
);

router.post(
  "/equipment/:id/service",
  protect,
  can("Equipment", "update"),
  ops.logService,
);
mount(
  "/equipment",
  "Equipment",
  crud(Equipment, {
    module: "Equipment",
    search: ["name", "brand", "serialNo", "code", "vendor"],
    filters: ["status", "category"],
    sort: "nextServiceOn name",
    beforeCreate: async (req, body) => {
      if (!body.code)
        body.code = await nextCode(req.user.tenantId, "equipment", "EQ", 4);
    },
  }),
);

const portal = require("../controllers/portalController");
router.post(
  "/members/:id/portal-access",
  protect,
  can("Members", "update"),
  portal.grantAccess,
);
router.delete(
  "/members/:id/portal-access",
  protect,
  can("Members", "update"),
  portal.revokeAccess,
);

router.get("/staff-attendance", protect, can("Staff", "read"), staff.getMonth);
router.get(
  "/staff-attendance/records",
  protect,
  can("Staff", "read"),
  staff.records,
);
router.post("/staff-attendance", protect, can("Staff", "update"), staff.mark);
router.get("/payroll", protect, can("Staff", "read"), staff.payroll);

// Optional staff self check-in/out + leave (gated by Settings.modules.staffAttendance inside the controller)
router.get("/staff-attendance/me", protect, self.me);
router.post("/staff-attendance/check-in", protect, photo, self.checkIn);
router.post("/staff-attendance/check-out", protect, photo, self.checkOut);
// face enrolment + biometric ID, the face kiosk, and biometric terminals
router.post(
  "/staff-attendance/enroll",
  protect,
  can("Staff", "update"),
  photo,
  face.enrollStaff,
);
router.post(
  "/member-attendance/enroll",
  protect,
  can("Members", "update"),
  photo,
  face.enrollMember,
);
router.post(
  "/attendance/kiosk-face",
  protect,
  can("Members", "update"),
  photo,
  face.kiosk,
);
router.get(
  "/attendance-devices",
  protect,
  can("Staff", "read"),
  face.listDevices,
);
router.post(
  "/attendance-devices",
  protect,
  can("Staff", "update"),
  face.addDevice,
);
router.delete(
  "/attendance-devices/:id",
  protect,
  can("Staff", "update"),
  face.removeDevice,
);
router.get("/member-attendance", protect, can("Members", "read"), memAtt.list);
router.post(
  "/member-attendance/check-in",
  protect,
  can("Members", "update"),
  memAtt.checkIn,
);
router.post(
  "/member-attendance/check-out",
  protect,
  can("Members", "update"),
  memAtt.checkOut,
);
router.get("/staff-leaves", protect, leave.listLeaves);
router.post("/staff-leaves", protect, leave.createLeave);
router.get("/staff-leaves/allowance", protect, leave.getAllowance);
router.put(
  "/staff-leaves/allowance",
  protect,
  can("Staff", "update"),
  leave.setAllowance,
);
router.put("/staff-leaves/:id", protect, leave.editLeave);
router.put(
  "/staff-leaves/:id/decision",
  protect,
  can("Staff", "update"),
  leave.decideLeave,
);
router.post("/staff-leaves/:id/cancel", protect, leave.cancelLeave);
router.put(
  "/staff-attendance/profile/:id",
  protect,
  can("Staff", "update"),
  face.saveProfile,
);
router.post(
  "/attendance/assign-ids",
  protect,
  can("Staff", "update"),
  face.assignIds,
);
router.get(
  "/attendance-devices/logs",
  protect,
  can("Staff", "read"),
  face.deviceLogs,
);
router.get(
  "/member-attendance/not-checked-in",
  protect,
  can("Members", "read"),
  memAtt.notCheckedIn,
);

router.get(
  "/members/:id/overview",
  protect,
  can("Members", "read"),
  getMemberOverview,
);

module.exports = router;
