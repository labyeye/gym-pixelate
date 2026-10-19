import { gym } from "@/services/gymApi";
import { chequeReceiptHtml, DEFAULT_RECEIPT_DESIGN } from "@/lib/chequeReceipt";
import { gymInvoiceForPdf, invoiceCompany, openInvoicePDF, resolveLogo } from "@/lib/invoicePdf";

const esc = (s: any) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const inr = (n: number) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const d = (x: any) =>
  x
    ? new Date(x).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

/** Fallback: plain HTML invoice in a print window (Save as PDF from the browser). Pulls company details from /invoices/:id. */
async function printInvoiceHtml(inv: any, member?: any) {
  const full = await gym.invoices.get(inv._id).catch(() => null);
  const i = full?.data || inv;
  const co = (full as any)?.company || {};
  const m = (typeof i.memberId === "object" && i.memberId) || member || {};
  const rows = (i.items || [])
    .map(
      (it: any) =>
        `<tr><td>${esc(it.description)}</td><td class=r>${it.quantity}</td><td class=r>${inr(it.unitPrice)}</td><td class=r>${it.gstPercent || 0}%</td><td class=r>${inr(it.amount)}</td></tr>`,
    )
    .join("");
  const pays = (i.payments || [])
    .map(
      (p: any) =>
        `<tr><td>${d(p.paidAt)}</td><td>${esc(p.method)}${p.reference ? " · " + esc(p.reference) : ""}${p.type === "refund" ? " (refund)" : ""}</td><td class=r>${inr(p.amount)}</td></tr>`,
    )
    .join("");
  const half = (i.gstAmount || 0) / 2;
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><title>${esc(i.invoiceNumber)}</title><style>
  body{font:14px system-ui,sans-serif;margin:32px;color:#0a0a0a} h1{margin:0;font-size:22px} .box{border:2px solid #0a0a0a;padding:14px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #0a0a0a;padding:6px 8px;text-align:left} th{background:#024bab;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.06em} .r{text-align:right}
  .tot td{font-weight:800} .muted{color:#666;font-size:12px} .tag{display:inline-block;border:2px solid #0a0a0a;padding:2px 8px;font-weight:800;text-transform:uppercase;font-size:12px}
  @media print{button{display:none}}</style>
  <div class=box><div style="display:flex;justify-content:space-between;gap:16px"><div><h1>${esc(co.name || "Gym")}</h1><div class=muted>${esc(co.address || "")}<br>${esc(co.phone || "")} ${esc(co.email || "")}<br>${co.gst ? "GSTIN: " + esc(co.gst) : ""}</div></div>
  <div style="text-align:right"><div class=tag>Tax Invoice</div><h1 style="margin-top:6px">${esc(i.invoiceNumber)}</h1><div class=muted>${d(i.issuedAt)}</div><div class=tag style="margin-top:6px">${esc(i.status)}</div></div></div></div>
  <div class=box><b>Bill to</b><br>${esc(m.name || "Walk-in customer")}<br><span class=muted>${esc(m.memberCode || "")} ${esc(m.phone || "")}</span></div>
  <table><tr><th>Description</th><th class=r>Qty</th><th class=r>Rate</th><th class=r>GST</th><th class=r>Amount</th></tr>${rows}</table>
  <table style="margin-top:12px;width:55%;margin-left:auto">
   ${i.discount ? `<tr><td>Discount${i.couponCode ? " (" + esc(i.couponCode) + ")" : ""}</td><td class=r>− ${inr(i.discount)}</td></tr>` : ""}
   <tr><td>Taxable value</td><td class=r>${inr(i.amount)}</td></tr><tr><td>CGST</td><td class=r>${inr(half)}</td></tr><tr><td>SGST</td><td class=r>${inr(half)}</td></tr>
   <tr class=tot><td>Total</td><td class=r>${inr(i.totalAmount)}</td></tr><tr><td>Paid</td><td class=r>${inr(i.paidAmount)}</td></tr><tr class=tot><td>Balance due</td><td class=r>${inr(Math.max(0, i.totalAmount - i.paidAmount))}</td></tr></table>
  ${pays ? `<h3>Payments</h3><table><tr><th>Date</th><th>Method</th><th class=r>Amount</th></tr>${pays}</table>` : ""}
  <p class=muted style="margin-top:24px">${esc(co.footer || "Thank you for training with us!")}</p><button onclick="print()">Print / Save PDF</button>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/**
 * Opens the invoice as a PDF laid out with the gym's own design (Settings > Invoice design; the classic
 * layout until they design one). Falls back to the plain print view if the PDF can't be built.
 */
export async function printInvoice(inv: any, member?: any) {
  // open the tab now, inside the click, so the browser doesn't treat it as a pop-up
  const tab = window.open("", "_blank");
  try {
    const full: any = await gym.invoices.get(inv._id);
    const i = full?.data || inv;
    const co = full?.company || {};
    const m = (typeof i.memberId === "object" && i.memberId) || member || {};
    if (co.receiptDesign?.style === "cheque" && tab) {
      const items = (i.items || []).map((x: any) => x.description).filter(Boolean);
      const lastPay = [...(i.payments || [])].reverse().find((p: any) => p.type !== "refund");
      tab.document.write(
        chequeReceiptHtml(
          {
            receiptNo: i.invoiceNumber,
            date: i.issuedAt,
            receivedFrom: m.name || "Walk-in customer",
            memberCode: m.memberCode,
            amount: i.paidAmount || 0,
            towards: items.join(", ") || "Gym services",
            method: lastPay?.method || i.paymentMethod,
            reference: lastPay?.reference,
            balance: Math.max(0, (i.totalAmount || 0) - (i.paidAmount || 0)),
            company: { name: co.name, address: co.address, phone: co.phone, gst: co.gst, logoUrl: co.logoUrl },
          },
          { ...DEFAULT_RECEIPT_DESIGN, ...co.receiptDesign },
          true,
        ),
      );
      tab.document.close();
      return;
    }
    const { invoice, client } = gymInvoiceForPdf(i, m);
    await openInvoicePDF(
      {
        invoice,
        client,
        company: invoiceCompany(co),
        logo: await resolveLogo(co.logoUrl),
        title: "TAX INVOICE",
        template: co.template || undefined,
      },
      tab,
    );
  } catch {
    tab?.close();
    return printInvoiceHtml(inv, member);
  }
}
