// The gym's invoice design (Settings.invoiceTemplate), same JSON as the web Invoice Designer:
// a theme plus an ordered list of layout blocks. The mobile editor changes theme, block order and
// visibility and the common block options; drag-and-drop images/text boxes stay on the web designer.
// The backend (utils/invoiceTemplate.js) validates this shape before storing it.

export type FontKey = 'Helvetica' | 'Times' | 'Courier';
export type BlockType = 'title' | 'header' | 'parties' | 'items' | 'words' | 'summary' | 'taxSummary' | 'footer' | 'note' | 'image' | 'spacer' | 'divider';

export interface Theme {
  primary: string;
  text: string;
  muted: string;
  border: string;
  headerBg: string;
  font: FontKey;
  scale: number;
  borders: 'full' | 'lines' | 'none';
  margin: number;
}
export interface Block {
  id: string;
  type: BlockType;
  visible: boolean;
  props: Record<string, any>;
}
export interface InvoiceTemplate {
  v: 1;
  theme: Theme;
  blocks: Block[];
  floats: any[];
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: 'Title bar',
  header: 'Company & invoice details',
  parties: 'Bill to',
  items: 'Items table',
  words: 'Amount in words',
  summary: 'Bank, terms & totals',
  taxSummary: 'Tax summary',
  footer: 'Declaration & signature',
  note: 'Text',
  image: 'Image',
  spacer: 'Spacer',
  divider: 'Divider line',
};

const BLOCK_DEFAULTS: Record<BlockType, Record<string, any>> = {
  title: { text: '', align: 'center', filled: false, subtitle: 'Original for Recipient' },
  header: { layout: 'split', swap: false, logoAlign: 'left', logoWidth: 150, logoHeight: 50, logoSrc: '', showLogo: true, showAddress: true, showContact: true, showTaxIds: true, showMeta: true, showPlace: true },
  parties: { label: 'Bill To', showEmail: true, showPhone: true, showGst: true },
  items: { sno: true, hsn: true, qty: false, rate: true, discount: true, amount: true, details: true, zebra: true, minRows: 6, accentHeader: false, descLabel: 'Description of Services / Goods' },
  words: { label: 'Amount in Words:', tint: true },
  summary: { showBank: true, showTerms: true, showTotals: true, totalsSide: 'right', termsLabel: 'Terms & Notes' },
  taxSummary: {},
  footer: { showDeclaration: true, declaration: '', showSignature: true, signatoryLabel: 'Authorised Signatory', signatureSrc: '', signatureWidth: 120, signatureHeight: 40 },
  note: { text: 'This is a computer-generated invoice and does not require a physical signature.', size: 7.5, align: 'center', bold: false, color: '', fill: '' },
  image: { src: '', width: 120, height: 60, align: 'left' },
  spacer: { height: 16 },
  divider: { thickness: 1, color: '' },
};

export const DEFAULT_THEME: Theme = {
  primary: '#024BAB',
  text: '#111111',
  muted: '#666666',
  border: '#222222',
  headerBg: '#ececec',
  font: 'Helvetica',
  scale: 1,
  borders: 'full',
  margin: 22,
};

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const newBlock = (type: BlockType): Block => ({ id: uid(), type, visible: true, props: { ...BLOCK_DEFAULTS[type] } });

export const defaultTemplate = (): InvoiceTemplate => ({
  v: 1,
  theme: { ...DEFAULT_THEME },
  blocks: (['title', 'header', 'parties', 'items', 'words', 'summary', 'taxSummary', 'footer', 'note'] as BlockType[]).map(newBlock),
  floats: [],
});

const patchBlocks = (t: InvoiceTemplate, type: BlockType, props: Record<string, any>) => ({
  ...t,
  blocks: t.blocks.map(b => (b.type === type ? { ...b, props: { ...b.props, ...props } } : b)),
});

export const PRESETS: Record<string, { label: string; build: () => InvoiceTemplate }> = {
  classic: { label: 'Classic', build: defaultTemplate },
  modern: {
    label: 'Modern',
    build: () => {
      let t = defaultTemplate();
      t = { ...t, theme: { ...t.theme, borders: 'lines', border: '#d1d5db', headerBg: '#eef2ff', muted: '#6b7280' } };
      t = patchBlocks(t, 'title', { filled: true, align: 'left', subtitle: '' });
      return patchBlocks(t, 'items', { accentHeader: true });
    },
  },
  minimal: {
    label: 'Minimal',
    build: () => {
      let t = defaultTemplate();
      t = { ...t, theme: { ...t.theme, borders: 'none', muted: '#8a8a8a' } };
      t = patchBlocks(t, 'title', { align: 'left', subtitle: '' });
      t = patchBlocks(t, 'items', { zebra: false });
      return patchBlocks(t, 'words', { tint: false });
    },
  },
};

/** Fills anything missing in a stored template so the editor can rely on every field. */
export function normalizeTemplate(raw: any): InvoiceTemplate {
  if (!raw || !Array.isArray(raw.blocks)) return defaultTemplate();
  return {
    v: 1,
    theme: { ...DEFAULT_THEME, ...(raw.theme || {}) },
    blocks: raw.blocks
      .filter((b: any) => b && BLOCK_DEFAULTS[b.type as BlockType])
      .map((b: any) => ({ id: String(b.id || uid()), type: b.type, visible: b.visible !== false, props: { ...BLOCK_DEFAULTS[b.type as BlockType], ...(b.props || {}) } })),
    floats: Array.isArray(raw.floats) ? raw.floats : [],
  };
}

export const ACCENTS = ['#024BAB', '#FA731C', '#0D9488', '#7C3AED', '#DC2626', '#111111'];
export const FONTS: FontKey[] = ['Helvetica', 'Times', 'Courier'];
