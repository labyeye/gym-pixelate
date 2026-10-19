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
      ["memberId", "name memberCode photo"],
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
      ["memberId", "name memberCode photo"],
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
router.get("/products/sales", protect, can("Products", "read"), purchases.sales);
router.get("/purchases", protect, can("Products", "read"), purchases.list);
router.post("/purchases", protect, can("Products", "create"), purchases.create);
router.post("/purchases/:id/receive", protect, can("Products", "update"), purchases.receive);
router.post("/purchases/:id/cancel", protect, can("Products", "update"), purchases.cancel);
router.put("/purchases/:id/bill", protect, can("Products", "update"), purchases.setBill);
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
      if (!body.sku) body.sku = await nextCode(req.user.tenantId, "product", "PRD", 4);
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
      if (!body.code) body.code = await nextCode(req.user.tenantId, "equipment", "EQ", 4);
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
router.post("/staff-attendance", protect, can("Staff", "update"), staff.mark);
router.get("/payroll", protect, can("Staff", "read"), staff.payroll);

router.get(
  "/members/:id/overview",
  protect,
  can("Members", "read"),
  getMemberOverview,
);

module.exports = router;
