// ID-card design: plain JSON stored on Setting.idCardTemplate (validated by backend/utils/idCardTemplate.js).
// A card has a front and an optional back; each side is a background colour plus positioned elements.
// x / y / w / h are percentages of the card, font sizes are in pt, so the same design prints at any physical size.

export type ElKind = "text" | "field" | "photo" | "logo" | "qr" | "shape" | "image";
export type Align = "left" | "center" | "right";
export type FontKey =
  | "sans"
  | "serif"
  | "mono"
  | "verdana"
  | "trebuchet"
  | "tahoma"
  | "impact"
  | "palatino"
  | "narrow";
export type ShapeKey = "square" | "rounded" | "circle";
export type SizeKey = "cr80-landscape" | "cr80-portrait" | "custom";

export type FieldKey =
  | "fullName"
  | "employeeId"
  | "designation"
  | "department"
  | "phone"
  | "email"
  | "bloodGroup"
  | "joinDate"
  | "dateOfBirth"
  | "issueDate"
  | "companyName"
  | "companyAddress"
  | "companyPhone"
  | "companyEmail"
  | "companyWebsite";

export interface IdEl {
  id: string;
  kind: ElKind;
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string; // kind "text"
  field: FieldKey; // kind "field"
  prefix: string; // shown before a field value, e.g. "ID: "
  size: number; // pt
  color: string;
  fill: string; // kind "shape"
  fill2: string; // second gradient colour ("" = solid)
  angle: number; // gradient angle in degrees
  src: string; // kind "image": an uploaded image (/uploads/id-card-images/…)
  fit: "cover" | "contain";
  rotate: number; // degrees
  borderColor: string;
  borderWidth: number; // mm, 0 = none (photo / image / shape)
  bold: boolean;
  italic: boolean;
  upper: boolean;
  spacing: number; // letter spacing in em
  align: Align;
  font: FontKey;
  shape: ShapeKey; // photo / shape outline
  radius: number; // % rounding for shape "rounded"
  opacity: number;
  qrField: FieldKey; // what a QR code encodes
}

export interface IdSide {
  bg: string;
  bg2?: string; // second background colour for a gradient ("" / missing = solid)
  bgAngle?: number;
  bgImage?: string; // uploaded background image, covers the whole card
  elements: IdEl[];
}

export interface IdCardTemplate {
  v: 1;
  size: SizeKey;
  customW: number;
  customH: number;
  cornerRadius: number; // mm
  backEnabled: boolean;
  front: IdSide;
  back: IdSide;
}

export interface IdCompany {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string; // absolute URL, or ""
}

export const PX_PER_MM = 96 / 25.4;

export const SIZE_OPTIONS: { key: SizeKey; label: string }[] = [
  { key: "cr80-landscape", label: "Card 85.6 × 54 mm (landscape)" },
  { key: "cr80-portrait", label: "Card 54 × 85.6 mm (portrait)" },
  { key: "custom", label: "Custom size" },
];

export function cardDims(t: IdCardTemplate): { w: number; h: number } {
  if (t.size === "cr80-portrait") return { w: 54, h: 85.6 };
  if (t.size === "custom") return { w: t.customW, h: t.customH };
  return { w: 85.6, h: 54 };
}

export const FIELD_OPTIONS: { key: FieldKey; label: string; group: string }[] = [
  { key: "fullName", label: "Member name", group: "Member" },
  { key: "employeeId", label: "Member ID", group: "Member" },
  { key: "designation", label: "Current plan", group: "Member" },
  { key: "department", label: "Plan valid till", group: "Member" },
  { key: "phone", label: "Phone", group: "Member" },
  { key: "email", label: "Email", group: "Member" },
  { key: "bloodGroup", label: "Blood group", group: "Member" },
  { key: "joinDate", label: "Joining date", group: "Member" },
  { key: "dateOfBirth", label: "Date of birth", group: "Member" },
  { key: "issueDate", label: "Issue date (today)", group: "Member" },
  { key: "companyName", label: "Company name", group: "Company" },
  { key: "companyAddress", label: "Company address", group: "Company" },
  { key: "companyPhone", label: "Company phone", group: "Company" },
  { key: "companyEmail", label: "Company email", group: "Company" },
  { key: "companyWebsite", label: "Company website", group: "Company" },
];

export const KIND_LABELS: Record<ElKind, string> = {
  text: "Text",
  field: "Data field",
  photo: "Photo",
  logo: "Company logo",
  qr: "QR code",
  shape: "Shape",
  image: "Image",
};

export const FONT_STACKS: Record<FontKey, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', Courier, monospace",
  verdana: "Verdana, Geneva, sans-serif",
  trebuchet: "'Trebuchet MS', Tahoma, sans-serif",
  tahoma: "Tahoma, Geneva, sans-serif",
  impact: "Impact, 'Arial Black', sans-serif",
  palatino: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  narrow: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
};

export const FONT_LABELS: Record<FontKey, string> = {
  sans: "Sans (Helvetica)",
  serif: "Serif (Georgia)",
  mono: "Mono (Courier)",
  verdana: "Verdana",
  trebuchet: "Trebuchet",
  tahoma: "Tahoma",
  impact: "Impact (bold headline)",
  palatino: "Palatino",
  narrow: "Narrow",
};

const fmtDate = (v?: string) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

/** The text a data field shows for this employee / company. */
export function fieldValue(
  key: FieldKey,
  emp: any,
  company: IdCompany,
): string {
  switch (key) {
    case "fullName":
      return emp?.name || "";
    case "employeeId":
      return emp?.memberCode || "";
    case "designation":
      return emp?.currentMembership?.planName || "";
    case "department":
      return fmtDate(emp?.currentMembership?.endDate); // key "department" is kept so saved designs still validate
    case "phone":
      return emp?.phone || "";
    case "email":
      return emp?.email || "";
    case "bloodGroup":
      return emp?.health?.bloodGroup || "";
    case "joinDate":
      return fmtDate(emp?.joinDate || emp?.createdAt);
    case "dateOfBirth":
      return fmtDate(emp?.dob);
    case "issueDate":
      return fmtDate(new Date().toISOString());
    case "companyName":
      return company.name;
    case "companyAddress":
      return company.address;
    case "companyPhone":
      return company.phone;
    case "companyEmail":
      return company.email;
    case "companyWebsite":
      return company.website;
  }
}

/** The text a QR element encodes (falls back to the employee ID so it is never empty). */
export const qrValue = (el: IdEl, emp: any, company: IdCompany) =>
  fieldValue(el.qrField, emp, company) || emp?.memberCode || "";

export const SAMPLE_EMPLOYEE = {
  name: "Aarav Sharma",
  memberCode: "GYM-00042",
  currentMembership: { planName: "Quarterly Gold", endDate: "2027-02-28" },
  phone: "98765 43210",
  email: "aarav@example.com",
  health: { bloodGroup: "B+" },
  joinDate: "2024-04-01",
  dob: "1996-08-12",
};

let n = 0;
export const newId = () => `e${Date.now().toString(36)}${(n++).toString(36)}`;

export function makeEl(kind: ElKind, over: Partial<IdEl> = {}): IdEl {
  const base: IdEl = {
    id: newId(),
    kind,
    visible: true,
    x: 10,
    y: 10,
    w: 30,
    h: 10,
    text: kind === "text" ? "Text" : "",
    field: "fullName",
    prefix: "",
    size: 9,
    color: "#111111",
    fill: "#044bab",
    fill2: "",
    angle: 135,
    src: "",
    fit: "cover",
    rotate: 0,
    borderColor: "#000000",
    borderWidth: 0,
    bold: false,
    italic: false,
    upper: false,
    spacing: 0,
    align: "left",
    font: "sans",
    shape: kind === "shape" || kind === "image" ? "square" : "rounded",
    radius: 12,
    opacity: 1,
    qrField: "employeeId",
  };
  if (kind === "photo") Object.assign(base, { w: 22, h: 40 });
  if (kind === "logo") Object.assign(base, { w: 16, h: 18 });
  if (kind === "qr") Object.assign(base, { w: 18, h: 28 });
  if (kind === "shape") Object.assign(base, { w: 40, h: 12 });
  if (kind === "image") Object.assign(base, { w: 30, h: 20 });
  return { ...base, ...over };
}

// Small builders shared with lib/idCardLibrary.ts
export const t = (text: string, over: Partial<IdEl>) => makeEl("text", { text, ...over });
export const f = (field: FieldKey, over: Partial<IdEl>) => makeEl("field", { field, ...over });
export const sh = (over: Partial<IdEl>) => makeEl("shape", over);
