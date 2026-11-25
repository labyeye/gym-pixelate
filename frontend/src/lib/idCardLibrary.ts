// Ready-made ID-card designs. Every layout is built from a colour theme (Palette), so the library shows the same
// layouts in any theme, and the designer can start from any of them.
import { f, makeEl, sh, t, type FieldKey, type IdCardTemplate, type IdEl, type IdSide } from "@/lib/idCard";

export interface Palette {
  id: string;
  name: string;
  primary: string; // main brand colour (bands, headings)
  accent: string; // stripe / highlight
  soft: string; // light tint used for frames and borders
}

export const PALETTES: Palette[] = [
  { id: "navy", name: "Navy & Orange", primary: "#1e3a8f", accent: "#f59e0b", soft: "#d3deec" },
  { id: "emerald", name: "Emerald & Gold", primary: "#047857", accent: "#eab308", soft: "#d1fae5" },
  { id: "crimson", name: "Crimson & Charcoal", primary: "#9f1239", accent: "#111827", soft: "#fde2e8" },
  { id: "purple", name: "Royal Purple", primary: "#5b21b6", accent: "#ec4899", soft: "#ede9fe" },
  { id: "teal", name: "Teal & Coral", primary: "#0e7490", accent: "#fb7185", soft: "#cffafe" },
  { id: "charcoal", name: "Charcoal & Lime", primary: "#1f2937", accent: "#84cc16", soft: "#e5e7eb" },
  { id: "sky", name: "Sky Blue", primary: "#0369a1", accent: "#38bdf8", soft: "#e0f2fe" },
];
export const DEFAULT_PALETTE = PALETTES[0];

const INK = "#0f172a";
const MUTED = "#475569";
const side = (bg: string, elements: IdEl[], extra: Partial<IdSide> = {}): IdSide => ({
  bg,
  bg2: "",
  bgAngle: 135,
  bgImage: "",
  elements,
  ...extra,
});
const base = (
  size: IdCardTemplate["size"],
  front: IdSide,
  back: IdSide,
  customW = 86,
  customH = 54,
): IdCardTemplate => ({
  v: 1,
  size,
  customW,
  customH,
  cornerRadius: 3.5,
  backEnabled: true,
  front,
  back,
});

// A back for portrait cards (terms, company details, signature) in the theme's colours.
function backPortrait(p: Palette): IdSide {
  return side("#ffffff", [
    sh({ x: 0, y: 0, w: 100, h: 9, fill: p.primary }),
    t("EMPLOYEE ID CARD", { x: 0, y: 0, w: 100, h: 9, size: 6.5, bold: true, color: "#ffffff", align: "center", spacing: 0.15 }),
    t("This card is the property of the company and must be carried at all times. If found, please return to:", {
      x: 8, y: 13, w: 84, h: 13, size: 6.8, color: "#334155",
    }),
    f("companyName", { x: 8, y: 28, w: 84, h: 5, size: 7.5, bold: true, color: INK }),
    f("companyAddress", { x: 8, y: 34, w: 84, h: 14, size: 6.3, color: MUTED }),
    f("companyPhone", { x: 8, y: 50, w: 84, h: 4.5, size: 6.5, color: "#334155", prefix: "Ph: " }),
    f("companyEmail", { x: 8, y: 55, w: 84, h: 4.5, size: 6.5, color: "#334155", prefix: "Email: " }),
    f("issueDate", { x: 8, y: 61, w: 84, h: 4.5, size: 6.3, color: "#64748b", prefix: "Issued: " }),
    sh({ x: 25, y: 80, w: 50, h: 0.5, fill: "#94a3b8" }),
    t("Authorised signatory", { x: 25, y: 81, w: 50, h: 4, size: 6, color: "#64748b", align: "center" }),
    sh({ x: 0, y: 89, w: 100, h: 1, fill: p.accent }),
    sh({ x: 0, y: 90, w: 100, h: 10, fill: p.primary }),
    f("companyName", { x: 4, y: 90, w: 92, h: 10, size: 6.5, color: "#ffffff", align: "center", upper: true, spacing: 0.15 }),
  ]);
}

// A back for landscape cards.
function backLandscape(p: Palette): IdSide {
  return side("#ffffff", [
    sh({ x: 0, y: 0, w: 100, h: 14, fill: p.primary }),
    t("EMPLOYEE ID CARD", { x: 0, y: 0, w: 100, h: 14, size: 8, bold: true, color: "#ffffff", align: "center", spacing: 0.12 }),
    t("This card is the property of the company and must be carried at all times. If found, please return to:", {
      x: 6, y: 19, w: 88, h: 24, size: 7, color: "#334155",
    }),
    f("companyName", { x: 6, y: 44, w: 88, h: 9, size: 8, bold: true, color: INK }),
    f("companyAddress", { x: 6, y: 53, w: 88, h: 16, size: 6.5, color: MUTED }),
    f("companyPhone", { x: 6, y: 72, w: 50, h: 8, size: 7, color: "#334155", prefix: "Ph: " }),
    f("issueDate", { x: 58, y: 72, w: 36, h: 8, size: 6.5, color: "#64748b", align: "right", prefix: "Issued: " }),
    sh({ x: 62, y: 81, w: 32, h: 0.8, fill: "#94a3b8" }),
    t("Authorised signatory", { x: 62, y: 82.5, w: 32, h: 8, size: 6, color: "#64748b", align: "center" }),
    sh({ x: 0, y: 95, w: 100, h: 5, fill: p.accent }),
  ]);
}

// ── Layouts ─────────────────────────────────────────────────────────────────────────────────────

/** Slot hole, centred logo and name, framed photo, three detail rows, stripe and an ID band. */
function professional(p: Palette): IdCardTemplate {
  const row = (label: string, field: FieldKey, y: number): IdEl[] => [
    t(label, { x: 17.5, y, w: 17, h: 4.2, size: 7.5, color: "#64748b" }),
    f(field, { x: 34.8, y, w: 63, h: 4.2, size: 7.5, color: INK }),
  ];
  return base(
    "cr80-portrait",
    side("#ffffff", [
      sh({ x: 39.2, y: 2.7, w: 21.6, h: 3.9, fill: "#cfd8e3", shape: "rounded", radius: 50 }),
      sh({ x: 40, y: 3.2, w: 20, h: 2.9, fill: "#f1f5f9", shape: "rounded", radius: 50 }),
      makeEl("logo", { x: 42, y: 7, w: 16, h: 10.1 }),
      f("companyName", { x: 6, y: 18, w: 88, h: 7, size: 6.2, color: MUTED, align: "center", upper: true, spacing: 0.12 }),
      sh({ x: 29.5, y: 25.9, w: 41, h: 30.3, fill: p.soft, shape: "rounded", radius: 7 }),
      sh({ x: 30.2, y: 26.5, w: 39.6, h: 29.1, fill: "#ffffff", shape: "rounded", radius: 6 }),
      makeEl("photo", { x: 31.3, y: 26.9, w: 37.4, h: 28.4, shape: "rounded", radius: 3 }),
      f("fullName", { x: 4, y: 59.2, w: 92, h: 5.6, size: 12.5, bold: true, color: INK, align: "center", upper: true, spacing: 0.05 }),
      f("designation", { x: 4, y: 64.8, w: 92, h: 5, size: 8.5, color: MUTED, align: "center", upper: true, spacing: 0.04 }),
      ...row("Valid till", "department", 71.6),
      ...row("Phone", "phone", 76.3),
      ...row("Email", "email", 80.9),
      sh({ x: 0, y: 89, w: 100, h: 1, fill: p.accent }),
      sh({ x: 0, y: 90, w: 100, h: 10, fill: p.primary }),
      f("employeeId", { x: 0, y: 90, w: 100, h: 10, size: 11.5, bold: true, color: "#ffffff", align: "center", spacing: 0.18 }),
    ]),
    backPortrait(p),
    54,
    86,
  );
}

/** Landscape with a coloured header band. */
function classic(p: Palette): IdCardTemplate {
  return base(
    "cr80-landscape",
    side("#ffffff", [
      sh({ x: 0, y: 0, w: 100, h: 24, fill: p.primary }),
      makeEl("logo", { x: 3, y: 3, w: 13, h: 18 }),
      f("companyName", { x: 18, y: 4, w: 78, h: 16, size: 9, bold: true, color: "#ffffff" }),
      makeEl("photo", { x: 5, y: 30, w: 24, h: 57, shape: "rounded", radius: 8 }),
      f("fullName", { x: 33, y: 30, w: 64, h: 13, size: 11, bold: true, color: INK }),
      f("designation", { x: 33, y: 43, w: 64, h: 8, size: 7.5, color: MUTED }),
      f("department", { x: 33, y: 50, w: 64, h: 8, size: 7, color: MUTED, prefix: "Valid till: " }),
      f("employeeId", { x: 33, y: 59, w: 44, h: 8, size: 7.5, bold: true, color: p.primary, prefix: "ID: " }),
      f("phone", { x: 33, y: 67, w: 44, h: 8, size: 7, color: "#334155", prefix: "Ph: " }),
      f("bloodGroup", { x: 33, y: 75, w: 44, h: 8, size: 7, color: "#334155", prefix: "Blood: " }),
      makeEl("qr", { x: 79, y: 62, w: 18, h: 29 }),
      sh({ x: 0, y: 95, w: 100, h: 5, fill: p.accent }),
    ]),
    backLandscape(p),
  );
}

/** Landscape with a coloured side panel and a round photo. */
function modern(p: Palette): IdCardTemplate {
  return base(
    "cr80-landscape",
    side("#ffffff", [
      sh({ x: 0, y: 0, w: 36, h: 100, fill: p.primary }),
      makeEl("photo", { x: 6, y: 14, w: 24, h: 38, shape: "circle", borderColor: "#ffffff", borderWidth: 0.6 }),
      makeEl("logo", { x: 7, y: 64, w: 22, h: 20 }),
      f("fullName", { x: 40, y: 12, w: 56, h: 15, size: 12, bold: true, color: INK }),
      f("designation", { x: 40, y: 28, w: 56, h: 9, size: 8, bold: true, color: p.primary }),
      f("department", { x: 40, y: 38, w: 56, h: 8, size: 7, color: "#64748b" }),
      sh({ x: 40, y: 48, w: 14, h: 1.2, fill: p.accent }),
      f("employeeId", { x: 40, y: 52, w: 38, h: 8, size: 8, bold: true, color: INK, prefix: "ID  " }),
      f("phone", { x: 40, y: 62, w: 38, h: 8, size: 7, color: "#334155", prefix: "Ph  " }),
      f("bloodGroup", { x: 40, y: 72, w: 38, h: 8, size: 7, color: "#334155", prefix: "Blood  " }),
      makeEl("qr", { x: 80, y: 58, w: 16, h: 25 }),
      f("companyName", { x: 40, y: 89, w: 56, h: 8, size: 6, color: "#94a3b8" }),
    ]),
    backLandscape(p),
  );
}

/** Portrait with a header band and a round photo. */
function banded(p: Palette): IdCardTemplate {
  return base(
    "cr80-portrait",
    side("#ffffff", [
      sh({ x: 0, y: 0, w: 100, h: 22, fill: p.primary }),
      makeEl("logo", { x: 41, y: 2.5, w: 18, h: 9 }),
      f("companyName", { x: 4, y: 12, w: 92, h: 8, size: 6.5, bold: true, color: "#ffffff", align: "center", upper: true, spacing: 0.1 }),
      makeEl("photo", { x: 25, y: 25, w: 50, h: 31.5, shape: "circle", borderColor: p.soft, borderWidth: 0.8 }),
      f("fullName", { x: 4, y: 58.5, w: 92, h: 7, size: 11, bold: true, color: INK, align: "center" }),
      f("designation", { x: 4, y: 65.5, w: 92, h: 5, size: 8, bold: true, color: p.primary, align: "center" }),
      f("department", { x: 4, y: 70.5, w: 92, h: 4.5, size: 7, color: "#64748b", align: "center" }),
      f("employeeId", { x: 4, y: 75, w: 92, h: 4.5, size: 8, bold: true, color: INK, align: "center", prefix: "ID: " }),
      makeEl("qr", { x: 38.9, y: 80.5, w: 22.2, h: 14 }),
      sh({ x: 0, y: 98, w: 100, h: 2, fill: p.accent }),
    ]),
    backPortrait(p),
    54,
    86,
  );
}

/** Clean white card: ring-framed round photo, centred text, thin accent bars. */
function minimal(p: Palette): IdCardTemplate {
  return base(
    "cr80-portrait",
    side("#ffffff", [
      sh({ x: 40, y: 5, w: 20, h: 1.1, fill: p.accent, shape: "rounded", radius: 50 }),
      makeEl("logo", { x: 41, y: 8, w: 18, h: 10.5 }),
      f("companyName", { x: 6, y: 19.5, w: 88, h: 5, size: 6, color: MUTED, align: "center", upper: true, spacing: 0.14 }),
      makeEl("photo", { x: 22, y: 27, w: 56, h: 35.3, shape: "circle", borderColor: p.primary, borderWidth: 0.7 }),
      f("fullName", { x: 4, y: 64.5, w: 92, h: 6, size: 12, bold: true, color: INK, align: "center", upper: true, spacing: 0.04 }),
      f("designation", { x: 4, y: 70.5, w: 92, h: 4.5, size: 8, bold: true, color: p.primary, align: "center", upper: true, spacing: 0.08 }),
      sh({ x: 35, y: 76, w: 30, h: 0.3, fill: "#cbd5e1" }),
      f("phone", { x: 4, y: 77.5, w: 92, h: 4, size: 7, color: MUTED, align: "center" }),
      f("email", { x: 4, y: 81.5, w: 92, h: 4, size: 6.5, color: MUTED, align: "center" }),
      f("employeeId", { x: 4, y: 88, w: 92, h: 6, size: 9, bold: true, color: p.primary, align: "center", spacing: 0.2 }),
      sh({ x: 0, y: 98.5, w: 100, h: 1.5, fill: p.accent }),
    ]),
    backPortrait(p),
    54,
    86,
  );
}

/** Landscape on a coloured background with a rounded photo and an accent ID chip. */
function bold(p: Palette): IdCardTemplate {
  return base(
    "cr80-landscape",
    side(p.primary, [
      makeEl("photo", { x: 5, y: 12, w: 28, h: 62, shape: "rounded", radius: 8, borderColor: "#ffffff", borderWidth: 0.5 }),
      f("companyName", { x: 36, y: 6, w: 60, h: 8, size: 6.5, color: "#ffffff", upper: true, spacing: 0.12, opacity: 0.8 }),
      f("fullName", { x: 36, y: 17, w: 60, h: 14, size: 12.5, bold: true, color: "#ffffff", upper: true }),
      f("designation", { x: 36, y: 31, w: 60, h: 8, size: 8, bold: true, color: p.accent }),
      sh({ x: 36, y: 41, w: 16, h: 1.2, fill: p.accent }),
      f("department", { x: 36, y: 45, w: 40, h: 7, size: 7, color: "#ffffff", prefix: "Valid till: " }),
      f("phone", { x: 36, y: 53, w: 40, h: 7, size: 7, color: "#ffffff", prefix: "Ph: " }),
      f("email", { x: 36, y: 61, w: 58, h: 7, size: 6.5, color: "#ffffff", prefix: "" }),
      sh({ x: 36, y: 74, w: 30, h: 14, fill: p.accent, shape: "rounded", radius: 20 }),
      f("employeeId", { x: 36, y: 74, w: 30, h: 14, size: 8.5, bold: true, color: INK, align: "center", spacing: 0.1 }),
      sh({ x: 77, y: 58, w: 20, h: 33, fill: "#ffffff", shape: "rounded", radius: 8 }),
      makeEl("qr", { x: 78.5, y: 60, w: 17, h: 28 }),
    ]),
    backLandscape(p),
  );
}

/** Portrait with a gradient header that the round photo overlaps, and a gradient ID bar. */
function gradient(p: Palette): IdCardTemplate {
  return base(
    "cr80-portrait",
    side("#ffffff", [
      sh({ x: 0, y: 0, w: 100, h: 42, fill: p.primary, fill2: p.accent, angle: 135 }),
      f("companyName", { x: 6, y: 4, w: 88, h: 6, size: 6.5, color: "#ffffff", align: "center", upper: true, spacing: 0.14 }),
      makeEl("logo", { x: 42, y: 11, w: 16, h: 9 }),
      makeEl("photo", { x: 25, y: 24, w: 50, h: 31.5, shape: "circle", borderColor: "#ffffff", borderWidth: 1.2 }),
      f("fullName", { x: 4, y: 58, w: 92, h: 6.5, size: 12.5, bold: true, color: INK, align: "center" }),
      f("designation", { x: 4, y: 65, w: 92, h: 5, size: 8.5, bold: true, color: p.primary, align: "center" }),
      f("department", { x: 4, y: 71, w: 92, h: 4, size: 7, color: MUTED, align: "center" }),
      f("phone", { x: 4, y: 75.5, w: 92, h: 4, size: 7, color: MUTED, align: "center" }),
      f("email", { x: 4, y: 80, w: 92, h: 4, size: 6.5, color: MUTED, align: "center" }),
      sh({ x: 0, y: 90, w: 100, h: 10, fill: p.primary, fill2: p.accent, angle: 90 }),
      f("employeeId", { x: 0, y: 90, w: 100, h: 10, size: 11, bold: true, color: "#ffffff", align: "center", spacing: 0.18 }),
    ]),
    backPortrait(p),
    54,
    86,
  );
}

/** Portrait with a big name, a role pill and a QR code. */
function badge(p: Palette): IdCardTemplate {
  return base(
    "cr80-portrait",
    side("#ffffff", [
      makeEl("logo", { x: 6, y: 4, w: 14, h: 8.5 }),
      f("companyName", { x: 22, y: 4, w: 72, h: 8.5, size: 7, bold: true, color: p.primary, upper: true }),
      sh({ x: 6, y: 14, w: 88, h: 0.6, fill: p.soft }),
      makeEl("photo", { x: 23, y: 17, w: 54, h: 34, shape: "rounded", radius: 10, borderColor: p.primary, borderWidth: 0.7 }),
      sh({ x: 12, y: 53, w: 76, h: 5.5, fill: p.accent, shape: "rounded", radius: 50 }),
      f("designation", { x: 12, y: 53, w: 76, h: 5.5, size: 6.5, bold: true, color: INK, align: "center", upper: true, spacing: 0.06 }),
      f("fullName", { x: 4, y: 61, w: 92, h: 8, size: 15, bold: true, color: p.primary, align: "center", upper: true }),
      f("department", { x: 4, y: 69.5, w: 92, h: 4.5, size: 8, color: MUTED, align: "center" }),
      f("phone", { x: 4, y: 74.5, w: 92, h: 4, size: 7, color: MUTED, align: "center" }),
      f("email", { x: 4, y: 78.5, w: 92, h: 4, size: 6.5, color: MUTED, align: "center" }),
      makeEl("qr", { x: 40, y: 82.8, w: 20, h: 12.6 }),
      sh({ x: 0, y: 96.5, w: 100, h: 3.5, fill: p.primary }),
      f("employeeId", { x: 0, y: 96.5, w: 100, h: 3.5, size: 5.5, bold: true, color: "#ffffff", align: "center", spacing: 0.2 }),
    ]),
    backPortrait(p),
    54,
    86,
  );
}

export interface LibraryItem {
  id: string;
  name: string;
  orientation: "portrait" | "landscape";
  build: (p: Palette) => IdCardTemplate;
}

export const LIBRARY: LibraryItem[] = [
  { id: "professional", name: "Professional", orientation: "portrait", build: professional },
  { id: "minimal", name: "Minimal", orientation: "portrait", build: minimal },
  { id: "gradient", name: "Gradient", orientation: "portrait", build: gradient },
  { id: "badge", name: "Badge", orientation: "portrait", build: badge },
  { id: "banded", name: "Header band", orientation: "portrait", build: banded },
  { id: "classic", name: "Classic", orientation: "landscape", build: classic },
  { id: "modern", name: "Modern panel", orientation: "landscape", build: modern },
  { id: "bold", name: "Bold", orientation: "landscape", build: bold },
];

export const defaultTemplate = (): IdCardTemplate => professional(DEFAULT_PALETTE);

/** Fills anything a stored design lacks (older or partial saves) so the renderer never sees undefined. */
export function normalizeTemplate(raw: any): IdCardTemplate {
  const d = defaultTemplate();
  if (!raw || typeof raw !== "object") return d;
  const sideOf = (s: any, fallback: IdSide): IdSide => ({
    bg: typeof s?.bg === "string" ? s.bg : fallback.bg,
    bg2: s?.bg2 || "",
    bgAngle: typeof s?.bgAngle === "number" ? s.bgAngle : 135,
    bgImage: s?.bgImage || "",
    elements: Array.isArray(s?.elements)
      ? s.elements.map((e: any) => makeEl(e.kind || "text", e))
      : fallback.elements,
  });
  return {
    v: 1,
    size: raw.size || d.size,
    customW: raw.customW || d.customW,
    customH: raw.customH || d.customH,
    cornerRadius: raw.cornerRadius ?? d.cornerRadius,
    backEnabled: raw.backEnabled ?? true,
    front: sideOf(raw.front, d.front),
    back: sideOf(raw.back, d.back),
  };
}
