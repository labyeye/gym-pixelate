const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { amountInWords } = require("./receiptPdf");

/*
 * Salary slip printed on the NestHR "SALARY PAYSLIP" cheque PDF (backend/assets/payrollcheque.pdf).
 * To change the look, replace that PDF and adjust the POS numbers below.
 * POS values are the same CSS-px coordinates NestHR uses: x from the left, y from the TOP of the page (1px = 1pt).
 */
const TEMPLATE = path.join(__dirname, "../assets/payrollcheque.pdf");
const POS = {
  gymName: { x: 75, y: 30, size: 13, bold: true },
  gymAddress: { x: 75, y: 48, size: 11, maxWidth: 300, lineHeight: 14 },
  dateChars: { y: 36, size: 11, xs: [430, 445, 460, 475, 491, 507, 523, 538] }, // DDMMYYYY, one box each
  name: { x: 100, y: 120, size: 11 },
  empId: { x: 320, y: 120, size: 11 },
  designation: { x: 445, y: 120, size: 11 },
  words: { x: 115, y: 145, size: 11 },
  amount: { x: 440, y: 150, size: 13, bold: true },
  from: { x: 250, y: 174, size: 11 },
  to: { x: 340, y: 174, size: 11 },
  tickCash: { x: 146, y: 173 },
  tickBank: { x: 203, y: 173 },
};

const clean = (s) => String(s ?? "").replace(/[^\x20-\x7E]/g, "").replace(/[\r\n]+/g, " ").trim();

// row: one entry of staffController payroll(); month "YYYY-MM"; mode "cash" | "bank"
async function buildSalarySlipPdf({ row, month, mode = "bank", gymName, gymAddress, empId }) {
  const doc = fs.existsSync(TEMPLATE)
    ? await PDFDocument.load(fs.readFileSync(TEMPLATE))
    : await PDFDocument.create();
  if (!doc.getPageCount()) doc.addPage([576, 263.25]);
  const page = doc.getPages()[0];
  const mb = page.getMediaBox();
  const top = mb.y + mb.height; // template MediaBox has a small y offset, so measure from its real top
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const dt = (t, p, over = {}) =>
    page.drawText(clean(t), {
      x: over.x ?? p.x,
      y: top - (over.y ?? p.y),
      size: p.size,
      font: p.bold ? bold : font,
      color: rgb(0, 0, 0),
    });

  const [y, m] = month.split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const net = Math.round(row.total || 0);

  dt(gymName || "", POS.gymName);
  // wrap the address like NestHR does
  let line = "";
  let ly = POS.gymAddress.y;
  for (const w of clean(gymAddress).split(" ")) {
    const t = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(t, POS.gymAddress.size) > POS.gymAddress.maxWidth && line) {
      dt(line, POS.gymAddress, { y: ly });
      line = w;
      ly += POS.gymAddress.lineHeight;
    } else line = t;
  }
  if (line) dt(line, POS.gymAddress, { y: ly });

  const now = new Date(Date.now() + 5.5 * 3600000);
  const ds = pad(now.getUTCDate()) + pad(now.getUTCMonth() + 1) + now.getUTCFullYear();
  POS.dateChars.xs.forEach((x, i) => dt(ds[i] || "", POS.dateChars, { x, y: POS.dateChars.y }));

  dt(row.name || "-", POS.name);
  dt(empId || "-", POS.empId);
  dt(String(row.role || "-").replace("_", " "), POS.designation);
  dt(amountInWords(net).replace(" Rupees Only", " Only"), POS.words);
  dt(net.toLocaleString("en-IN"), POS.amount);
  dt(`01/${pad(m)}/${y}`, POS.from);
  dt(`${last}/${pad(m)}/${y}`, POS.to);

  const t = mode === "cash" ? POS.tickCash : POS.tickBank;
  const size = 7;
  const Y = top - t.y;
  page.drawLine({ start: { x: t.x, y: Y + size * 0.35 }, end: { x: t.x + size * 0.35, y: Y }, thickness: 1.4, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: t.x + size * 0.35, y: Y }, end: { x: t.x + size, y: Y + size * 0.75 }, thickness: 1.4, color: rgb(0, 0, 0) });

  return Buffer.from(await doc.save());
}

module.exports = { buildSalarySlipPdf, POS };
