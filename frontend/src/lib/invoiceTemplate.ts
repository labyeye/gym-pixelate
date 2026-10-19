// The tenant's invoice design: a theme, an ordered list of layout blocks, and free-floating
// images/text placed anywhere on the page. Plain JSON, stored on Settings.invoiceTemplate and
// rendered by components/pdf/InvoicePDFDocument (PDF) and the Invoice Designer canvas (preview).
// backend/utils/invoiceTemplate.js validates the same shape before it is saved.

export const PAGE_W = 595.28; // A4 in points
export const PAGE_H = 841.89;

export type FontKey = "Helvetica" | "Times" | "Courier";
export type Align = "left" | "center" | "right";

export interface Theme {
  primary: string;
  text: string;
  muted: string;
  border: string;
  headerBg: string;
  font: FontKey;
  scale: number; // multiplies every font size
  borders: "full" | "lines" | "none"; // outer box + dividers / dividers only / neither
  margin: number; // page side margin in pt
}

export type BlockType =
  | "title"
  | "header"
  | "parties"
  | "items"
  | "words"
  | "summary"
  | "taxSummary"
  | "footer"
  | "note"
  | "image"
  | "spacer"
  | "divider";

export interface Block {
  id: string;
  type: BlockType;
  visible: boolean;
  props: Record<string, any>;
}

// Positioned in % of the page so it stays put at any preview size.
export interface Float {
  id: string;
  kind: "image" | "text";
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  text: string;
  size: number;
  color: string;
  bold: boolean;
  align: Align;
  opacity: number; // 0.05 - 1
  back: boolean; // behind the invoice (watermark) instead of on top
  allPages: boolean;
}

export interface InvoiceTemplate {
  v: 1;
  theme: Theme;
  blocks: Block[];
  floats: Float[];
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: "Title bar",
  header: "Company & invoice details",
  parties: "Bill to",
  items: "Items table",
  words: "Amount in words",
  summary: "Bank, terms & totals",
  taxSummary: "Tax summary",
  footer: "Declaration & signature",
  note: "Text",
  image: "Image",
  spacer: "Spacer",
  divider: "Divider line",
};

const BLOCK_DEFAULTS: Record<BlockType, Record<string, any>> = {
  title: {
    text: "",
    align: "center",
    filled: false,
    subtitle: "Original for Recipient",
  },
  header: {
    layout: "split", // company beside the invoice details, or stacked
    swap: false,
    logoAlign: "left",
    logoWidth: 150,
    logoHeight: 50,
    logoSrc: "", // blank = the company logo from Settings
    showLogo: true,
    showAddress: true,
    showContact: true,
    showTaxIds: true,
    showMeta: true,
    showPlace: true,
  },
  parties: {
    label: "Bill To",
    showEmail: true,
    showPhone: true,
    showGst: true,
  },
  items: {
    sno: true,
    hsn: true,
    qty: false,
    rate: true,
    discount: true,
    amount: true,
    details: true,
    zebra: true,
    minRows: 6,
    accentHeader: false,
    descLabel: "Description of Services / Goods",
  },
  words: { label: "Amount in Words:", tint: true },
  summary: {
    showBank: true,
    showTerms: true,
    showTotals: true,
    totalsSide: "right",
    termsLabel: "Terms & Notes",
  },
  taxSummary: {},
  footer: {
    showDeclaration: true,
    declaration: "",
    showSignature: true,
    signatoryLabel: "Authorised Signatory",
    signatureSrc: "",
    signatureWidth: 120,
    signatureHeight: 40,
  },
  note: {
    text: "This is a computer-generated invoice and does not require a physical signature.",
    size: 7.5,
    align: "center",
    bold: false,
    color: "",
    fill: "",
  },
  image: { src: "", width: 120, height: 60, align: "left" },
  spacer: { height: 16 },
  divider: { thickness: 1, color: "" },
};

export const DEFAULT_THEME: Theme = {
  primary: "#024BAB",
  text: "#111111",
  muted: "#666666",
  border: "#222222",
  headerBg: "#ececec",
  font: "Helvetica",
  scale: 1,
  borders: "full",
  margin: 22,
};

let counter = 0;
export const uid = () =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function newBlock(
  type: BlockType,
  props: Record<string, any> = {},
): Block {
  return {
    id: uid(),
    type,
    visible: true,
    props: { ...BLOCK_DEFAULTS[type], ...props },
  };
}

// Free sizing: every block has a width (props.w, % of the row, default 100) and an optional
// minimum height (props.h in pt, 0 = fit the content). Consecutive blocks whose widths add up to
// 100 or less share one row; the next block that doesn't fit starts a new row. The items table and
// tax summary need the full width, so only their height can change.
export const CAN_WIDTH = (t: BlockType) => t !== "items" && t !== "taxSummary";
export const blockW = (b: Block) =>
  CAN_WIDTH(b.type)
    ? Math.min(100, Math.max(10, Number(b.props.w) || 100))
    : 100;
export const blockH = (b: Block) =>
  Math.min(800, Math.max(0, Number(b.props.h) || 0));
export const isPlainRow = (row: Block[]) =>
  row.length === 1 && blockW(row[0]) === 100 && !blockH(row[0]);

export function groupRows(blocks: Block[]): Block[][] {
  const rows: Block[][] = [];
  let sum = 0;
  for (const b of blocks) {
    const w = blockW(b);
    if (rows.length && sum + w <= 100.01) rows[rows.length - 1].push(b);
    else (rows.push([b]), (sum = 0));
    sum += w;
  }
  return rows;
}

export function newFloat(
  kind: Float["kind"],
  patch: Partial<Float> = {},
): Float {
  return {
    id: uid(),
    kind,
    visible: true,
    x: 60,
    y: 4,
    w: kind === "image" ? 25 : 30,
    h: kind === "image" ? 10 : 4,
    src: "",
    text: kind === "text" ? "Your text" : "",
    size: 12,
    color: "#111111",
    bold: false,
    align: "left",
    opacity: 1,
    back: false,
    allPages: false,
    ...patch,
  };
}

export function defaultTemplate(): InvoiceTemplate {
  return {
    v: 1,
    theme: { ...DEFAULT_THEME },
    blocks: (
      [
        "title",
        "header",
        "parties",
        "items",
        "words",
        "summary",
        "taxSummary",
        "footer",
        "note",
      ] as BlockType[]
    ).map((t) => newBlock(t)),
    floats: [],
  };
}

// Invoices, sales orders and purchase orders share one saved design (Settings.invoiceTemplate);
// quotations have their own (Settings.quotationTemplate). Same editor, different wording.
export type DocKind = "invoice" | "quotation";

export function localize(
  t: InvoiceTemplate,
  kind: DocKind,
  footer?: string,
): InvoiceTemplate {
  if (kind === "invoice") return t;
  return {
    ...t,
    blocks: t.blocks.map((b) =>
      b.type === "footer" && !b.props.declaration
        ? {
            ...b,
            props: {
              ...b.props,
              declaration:
                "We declare that this quotation shows the price of the goods/services described and that all particulars are true and correct.",
            },
          }
        : b.type === "note" && b.props.text === BLOCK_DEFAULTS.note.text
          ? {
              ...b,
              props: {
                ...b.props,
                text: footer || "Thank you for your business!",
              },
            }
          : b,
    ),
  };
}

// The template to print with: the tenant's saved design, else the classic layout in that document's wording.
export const templateFor = (
  kind: DocKind,
  saved: any,
  footer?: string,
): InvoiceTemplate =>
  saved ? normalizeTemplate(saved) : localize(defaultTemplate(), kind, footer);

export const PRESETS: Record<
  string,
  { label: string; build: () => InvoiceTemplate }
> = {
  classic: { label: "Classic (boxed)", build: defaultTemplate },
  modern: {
    label: "Modern (accent colour)",
    build: () => {
      const t = defaultTemplate();
      t.theme = {
        ...t.theme,
        borders: "lines",
        border: "#d1d5db",
        headerBg: "#eef2ff",
        muted: "#6b7280",
      };
      t.blocks = t.blocks.map((b) =>
        b.type === "title"
          ? {
              ...b,
              props: { ...b.props, filled: true, align: "left", subtitle: "" },
            }
          : b.type === "items"
            ? { ...b, props: { ...b.props, accentHeader: true } }
            : b,
      );
      return t;
    },
  },
  minimal: {
    label: "Minimal (no borders)",
    build: () => {
      const t = defaultTemplate();
      t.theme = { ...t.theme, borders: "none", muted: "#8a8a8a" };
      t.blocks = t.blocks.map((b) =>
        b.type === "title"
          ? { ...b, props: { ...b.props, align: "left", subtitle: "" } }
          : b.type === "items"
            ? { ...b, props: { ...b.props, zebra: false } }
            : b.type === "words"
              ? { ...b, props: { ...b.props, tint: false } }
              : b,
      );
      return t;
    },
  },
};

const isHex = (v: any) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const num = (v: any, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

// Fills gaps in a stored (possibly older or partial) template with defaults, so a renderer never
// has to guess. null / garbage gives the default template.
export function normalizeTemplate(raw: any): InvoiceTemplate {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks))
    return defaultTemplate();
  const th = raw.theme || {};
  const theme: Theme = {
    primary: isHex(th.primary) ? th.primary : DEFAULT_THEME.primary,
    text: isHex(th.text) ? th.text : DEFAULT_THEME.text,
    muted: isHex(th.muted) ? th.muted : DEFAULT_THEME.muted,
    border: isHex(th.border) ? th.border : DEFAULT_THEME.border,
    headerBg: isHex(th.headerBg) ? th.headerBg : DEFAULT_THEME.headerBg,
    font: ["Helvetica", "Times", "Courier"].includes(th.font)
      ? th.font
      : "Helvetica",
    scale: num(th.scale, 0.8, 1.3, 1),
    borders: ["full", "lines", "none"].includes(th.borders)
      ? th.borders
      : "full",
    margin: num(th.margin, 8, 60, 22),
  };
  const blocks: Block[] = raw.blocks
    .filter((b: any) => b && b.type in BLOCK_DEFAULTS)
    .map((b: any) => {
      const props = {
        ...BLOCK_DEFAULTS[b.type as BlockType],
        ...(b.props || {}),
      };
      for (const key of ["color", "fill"])
        if (key in props && !isHex(props[key])) props[key] = ""; // half-typed colour = theme default
      return {
        id: String(b.id || uid()),
        type: b.type,
        visible: b.visible !== false,
        props,
      };
    });
  const floats: Float[] = (Array.isArray(raw.floats) ? raw.floats : [])
    .filter((f: any) => f && (f.kind === "image" || f.kind === "text"))
    .map((f: any) => {
      const m = { ...newFloat(f.kind), ...f, id: String(f.id || uid()) };
      return {
        ...m,
        color: isHex(m.color) ? m.color : "#111111",
        opacity: num(m.opacity, 0.05, 1, 1),
      };
    });
  return { v: 1, theme, blocks, floats };
}

export type VarCtx = Record<string, string>;

export const TEMPLATE_VARS = [
  "company.name",
  "company.phone",
  "company.email",
  "client.name",
  "invoice.number",
  "invoice.date",
  "invoice.due",
  "invoice.total",
  "invoice.balance",
];

// "Thanks {{client.name}}!" -> "Thanks Acme!"; unknown variables become empty.
export const fillVars = (text: string, ctx: VarCtx) =>
  String(text ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => ctx[k] ?? "");
