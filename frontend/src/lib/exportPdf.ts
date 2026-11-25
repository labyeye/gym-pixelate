import jsPDF from "jspdf";

// Plain table PDF for the Export dropdown (same look as NestHR). Long cells are clipped.
// ponytail: swap in jspdf-autotable if wrapping is ever needed (already installed).
export function exportTablePdf(
  name: string,
  head: string[],
  body: (string | number | null | undefined)[][],
) {
  const pdf = new jsPDF({
    orientation: head.length > 6 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 30;
  const cw = (W - m * 2) / head.length;
  const fit = (s: string, size: number) => {
    const max = Math.floor(cw / (size * 0.52));
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "..." : s;
  };
  // jsPDF's built-in font has no rupee sign
  const txt = (v: unknown) =>
    String(v ?? "")
      .replace(/₹/g, "Rs.")
      .replace(/[^\x20-\x7E]/g, "");
  let y = m;
  const header = () => {
    pdf.setFont("helvetica", "bold").setFontSize(14).text(name, m, y);
    y += 20;
    pdf.setFillColor(2, 75, 171).rect(m, y - 10, W - m * 2, 16, "F");
    pdf.setFontSize(8).setTextColor(255);
    head.forEach((h, i) => pdf.text(fit(txt(h), 8), m + i * cw + 3, y + 1));
    pdf.setTextColor(0).setFont("helvetica", "normal");
    y += 16;
  };
  header();
  body.forEach((r, n) => {
    if (y > H - m) {
      pdf.addPage();
      y = m;
      header();
    }
    if (n % 2)
      pdf.setFillColor(243, 246, 252).rect(m, y - 9, W - m * 2, 14, "F");
    r.forEach((c, i) => pdf.text(fit(txt(c), 8), m + i * cw + 3, y));
    y += 14;
  });
  pdf.save(`${name}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
