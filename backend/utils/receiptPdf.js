const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// Member payment receipt as a PDF (cheque-style, A5 landscape). Used for the "Download receipt" button and
// the WhatsApp receipt. Look comes from Settings > Receipt design (accent colour, signatory, note, words).
// Helvetica has no rupee sign, so amounts print as "Rs.".

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const below1000 = (n) =>
  (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? below100(n % 100) : "");

function amountInWords(amount) {
  const total = Math.round(Math.abs(Number(amount) || 0) * 100);
  let rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (!rupees && !paise) return "Zero Rupees Only";
  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(below1000(crore) + " Crore");
  if (lakh) parts.push(below100(lakh) + " Lakh");
  if (thousand) parts.push(below100(thousand) + " Thousand");
  if (rupees) parts.push(below1000(rupees));
  const r = parts.join(" ");
  return `${r ? r + " Rupees" : ""}${paise ? (r ? " and " : "") + below100(paise) + " Paise" : ""} Only`;
}

const money = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d) =>
  new Date(d || Date.now()).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
const clean = (s) => String(s ?? "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim(); // WinAnsi-safe
const hex = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h || "") || /^#([0-9a-f]{6})$/i.exec("#024BAB");
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

async function buildReceiptPdf({ invoice, member, setting, gymName }) {
  const design = setting?.receiptDesign || {};
  const accent = hex(design.accent);
  const inv = invoice;
  const pays = (inv.payments || []).filter((p) => p.type !== "refund");
  const last = pays[pays.length - 1];
  const amount = last ? last.amount : inv.paidAmount || 0;
  const balance = Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0));
  const towards = clean((inv.items || []).map((i) => i.description).filter(Boolean).join(", ")) || "Payment";

  const pdf = await PDFDocument.create();
  const W = 595, H = 420;
  const page = pdf.addPage([W, H]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.08, 0.14);
  const grey = rgb(0.4, 0.43, 0.5);
  const text = (t, x, y, size = 10, font = f, color = ink) =>
    page.drawText(clean(t), { x, y, size, font, color });
  const right = (t, xr, y, size = 10, font = f, color = ink) =>
    text(t, xr - font.widthOfTextAtSize(clean(t), size), y, size, font, color);
  const line = (x1, y1, x2, y2, c = ink, t = 0.8) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c });

  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: accent, borderWidth: 2 });
  page.drawRectangle({ x: 18, y: H - 78, width: W - 36, height: 60, color: accent });
  text(gymName || setting?.companyName || "Gym", 34, H - 46, 18, b, rgb(1, 1, 1));
  const sub = [setting?.companyAddress, setting?.companyPhone].filter(Boolean).join("  |  ");
  if (sub) text(sub.slice(0, 95), 34, H - 63, 8.5, f, rgb(0.9, 0.93, 1));
  right("PAYMENT RECEIPT", W - 34, H - 46, 12, b, rgb(1, 1, 1));
  if (setting?.companyGST) right("GSTIN " + setting.companyGST, W - 34, H - 63, 8.5, f, rgb(0.9, 0.93, 1));

  let y = H - 108;
  text("Receipt No", 34, y, 8, f, grey);
  text(inv.invoiceNumber, 34, y - 13, 11, b);
  text("Date", 250, y, 8, f, grey);
  text(dmy(last?.paidAt || inv.issuedAt), 250, y - 13, 11, b);
  text("Mode", 400, y, 8, f, grey);
  text(String(last?.method || inv.paymentMethod || "-").replace("_", " ").toUpperCase(), 400, y - 13, 11, b);

  y -= 44;
  text("Received with thanks from", 34, y, 8, f, grey);
  text((member?.name || "Walk-in customer") + (member?.memberCode ? "  (" + member.memberCode + ")" : ""), 34, y - 14, 13, b);
  y -= 42;
  text("Towards", 34, y, 8, f, grey);
  text(towards.slice(0, 90), 34, y - 13, 10.5, f);
  if (last?.reference) text("Ref: " + last.reference, 34, y - 27, 8.5, f, grey);

  if (design.showWords !== false) {
    y -= 52;
    text("Rupees", 34, y, 8, f, grey);
    text(amountInWords(amount).slice(0, 100), 34, y - 13, 10, f);
    line(34, y - 18, W - 190, y - 18, grey, 0.5);
  }

  // amount box
  page.drawRectangle({ x: W - 180, y: 120, width: 146, height: 52, borderColor: ink, borderWidth: 1.5 });
  text("AMOUNT PAID", W - 172, 158, 7.5, f, grey);
  text(money(amount), W - 172, 133, 15, b, accent);
  if (balance > 0) right("Balance due " + money(balance), W - 34, 106, 9, b, rgb(0.8, 0.15, 0.15));
  else right("Fully paid", W - 34, 106, 9, b, rgb(0.05, 0.6, 0.35));

  if (design.showCrossing !== false) {
    text("A/C PAYEE", 34, 124, 9, b, accent);
    line(34, 120, 100, 120, accent, 1);
  }
  line(W - 220, 66, W - 40, 66, ink, 0.8);
  right(design.signatory || "Authorised Signatory", W - 40, 52, 9, f, grey);
  const note = design.note || "This is a computer generated receipt.";
  text(note.slice(0, 120), 34, 34, 7.5, f, grey);
  return Buffer.from(await pdf.save());
}

module.exports = { buildReceiptPdf, amountInWords };
