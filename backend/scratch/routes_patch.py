import io


def edit(p, fn):
    s = io.open(p, newline="", encoding="utf-8").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)


def r(s):
    a = 'router.post("/products/sell"'
    assert a in s
    return s.replace(
        a,
        '''const purchases = require("../controllers/purchaseController");
router.get("/products/sales", protect, can("Products", "read"), purchases.sales);
router.get("/purchases", protect, can("Products", "read"), purchases.list);
router.post("/purchases", protect, can("Products", "create"), purchases.create);
router.post("/purchases/:id/receive", protect, can("Products", "update"), purchases.receive);
router.post("/purchases/:id/cancel", protect, can("Products", "update"), purchases.cancel);
router.put("/purchases/:id/bill", protect, can("Products", "update"), purchases.setBill);
'''
        + a,
        1,
    )


edit(r"D:\projects\Pixelate Nest\NestGym\backend\routes\gymRoutes.js", r)


def u(s):
    a = 'router.post("/", protect, (req, res, next) => {'
    assert a in s
    return s.replace(
        a,
        '''// vendor bills / documents: PDF or photo
const billUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    /^(pdf|jpe?g|png|webp)$/.test(ext) ? cb(null, true) : cb(new Error("Only PDF or photo bills are allowed"));
  },
});
router.post("/bill", protect, (req, res, next) => {
  billUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 8 MB)" : err.message });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  const base = (process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\\/$/, "");
  res.json({ success: true, url: `${base}/uploads/${req.file.filename}` });
});

'''
        + a,
        1,
    )


edit(r"D:\projects\Pixelate Nest\NestGym\backend\routes\uploadRoutes.js", u)
