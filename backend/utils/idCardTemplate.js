// Validates and cleans the ID-card design before it is saved on Setting.idCardTemplate.
// The shape mirrors frontend/src/lib/idCard.ts: a card size plus a front (and optional back) made of positioned
// elements. Anything unknown is dropped, numbers are clamped and strings are length-limited, so a stored design can
// never carry scripts, huge payloads or arbitrary CSS (colours are hex only, fonts come from a fixed list).
const KINDS = ["text", "field", "photo", "logo", "qr", "shape", "image"];
const FIELDS = [
  "fullName",
  "employeeId",
  "designation",
  "department",
  "phone",
  "email",
  "bloodGroup",
  "joinDate",
  "dateOfBirth",
  "issueDate",
  "companyName",
  "companyAddress",
  "companyPhone",
  "companyEmail",
  "companyWebsite",
];
const FONTS = [
  "sans",
  "serif",
  "mono",
  "verdana",
  "trebuchet",
  "tahoma",
  "impact",
  "palatino",
  "narrow",
];
// Uploaded design images live only in our own public folder; external URLs are never accepted.
const IMG_SRC = /^\/uploads\/id-card-images\/[A-Za-z0-9._-]{1,120}$/;
const FITS = ["cover", "contain"];
const ALIGNS = ["left", "center", "right"];
const SHAPES = ["square", "rounded", "circle"];
const SIZES = ["cr80-landscape", "cr80-portrait", "custom"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_ELEMENTS = 40;
const MAX_JSON = 60000;

const num = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v, max) => String(v ?? "").slice(0, max);
const color = (v, def) => (HEX.test(String(v)) ? String(v) : def);
const optColor = (v) => (HEX.test(String(v)) ? String(v) : ""); // "" = not used
const imgSrc = (v) => (IMG_SRC.test(String(v)) ? String(v) : "");
const pick = (v, list, def) => (list.includes(v) ? v : def);

function cleanElement(e) {
  if (!e || typeof e !== "object" || !KINDS.includes(e.kind)) return null;
  return {
    id: str(e.id, 40) || Math.random().toString(36).slice(2, 10),
    kind: e.kind,
    visible: e.visible !== false,
    x: num(e.x, -20, 120, 0),
    y: num(e.y, -20, 120, 0),
    w: num(e.w, 0.2, 140, 20),
    h: num(e.h, 0.2, 140, 10),
    text: str(e.text, 200),
    field: pick(e.field, FIELDS, "fullName"),
    prefix: str(e.prefix, 40),
    size: num(e.size, 4, 60, 9),
    color: color(e.color, "#111111"),
    fill: color(e.fill, "#044bab"),
    fill2: optColor(e.fill2), // second gradient colour ("" = solid fill)
    angle: num(e.angle, 0, 360, 135),
    src: imgSrc(e.src),
    fit: pick(e.fit, FITS, "cover"),
    rotate: num(e.rotate, -180, 180, 0),
    borderColor: color(e.borderColor, "#000000"),
    borderWidth: num(e.borderWidth, 0, 3, 0), // mm
    bold: !!e.bold,
    italic: !!e.italic,
    upper: !!e.upper,
    spacing: num(e.spacing, 0, 0.5, 0),
    align: pick(e.align, ALIGNS, "left"),
    font: pick(e.font, FONTS, "sans"),
    shape: pick(e.shape, SHAPES, "rounded"),
    radius: num(e.radius, 0, 50, 0),
    opacity: num(e.opacity, 0.05, 1, 1),
    qrField: pick(e.qrField, FIELDS, "employeeId"),
  };
}

function cleanSide(s) {
  if (!s || typeof s !== "object")
    return { bg: "#ffffff", bg2: "", bgAngle: 135, bgImage: "", elements: [] };
  const elements = (Array.isArray(s.elements) ? s.elements : [])
    .slice(0, MAX_ELEMENTS)
    .map(cleanElement)
    .filter(Boolean);
  return {
    bg: color(s.bg, "#ffffff"),
    bg2: optColor(s.bg2), // second background colour ("" = solid)
    bgAngle: num(s.bgAngle, 0, 360, 135),
    bgImage: imgSrc(s.bgImage),
    elements,
  };
}

/** Returns the cleaned template, or null to clear it. Throws on an unusable payload. */
function sanitizeIdCardTemplate(t) {
  if (t === null || t === undefined) return null;
  if (typeof t !== "object" || Array.isArray(t)) {
    throw new Error("Invalid ID card design");
  }
  const size = pick(t.size, SIZES, "cr80-landscape");
  const out = {
    v: 1,
    size,
    customW: num(t.customW, 30, 210, 86),
    customH: num(t.customH, 30, 297, 54),
    cornerRadius: num(t.cornerRadius, 0, 10, 3),
    backEnabled: !!t.backEnabled,
    front: cleanSide(t.front),
    back: cleanSide(t.back),
  };
  if (JSON.stringify(out).length > MAX_JSON) {
    throw new Error("ID card design is too large");
  }
  return out;
}

module.exports = { sanitizeIdCardTemplate, FIELDS };

if (require.main === module) {
  const assert = require("assert");
  const ok = sanitizeIdCardTemplate({
    size: "cr80-landscape",
    front: {
      bg: "#fff",
      elements: [
        { kind: "text", text: "<script>x</script>", x: 5, y: 5, w: 50, h: 10, color: "red; background:url(x)" },
        { kind: "evil", x: 1 },
        { kind: "field", field: "nope", size: 999 },
        { kind: "image", src: "https://evil.example/x.png", rotate: 999, fill2: "red" },
        { kind: "image", src: "/uploads/id-card-images/idc_ab_1.png", borderWidth: 99 },
      ],
    },
  });
  assert.strictEqual(ok.front.elements.length, 4); // unknown kind dropped, images kept
  assert.strictEqual(ok.front.elements[2].src, ""); // external URL refused
  assert.strictEqual(ok.front.elements[2].rotate, 180); // clamped
  assert.strictEqual(ok.front.elements[2].fill2, ""); // non-hex gradient colour ignored
  assert.strictEqual(ok.front.elements[3].src, "/uploads/id-card-images/idc_ab_1.png"); // own upload kept
  assert.strictEqual(ok.front.elements[3].borderWidth, 3); // clamped
  assert.strictEqual(ok.front.bg, "#ffffff"); // bad hex falls back
  assert.strictEqual(ok.front.elements[0].color, "#111111"); // CSS injection falls back
  assert.strictEqual(ok.front.elements[1].size, 60); // clamped
  assert.strictEqual(ok.front.elements[1].field, "fullName"); // unknown field falls back
  assert.strictEqual(sanitizeIdCardTemplate(null), null);
  assert.throws(() => sanitizeIdCardTemplate("x"));
  console.log("idCardTemplate self-test ok");
}
