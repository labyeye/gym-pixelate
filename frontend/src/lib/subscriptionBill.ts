/** Bill for a NestGym subscription payment (Pixelate Nest -> the gym). Number format KHT/GYM/001. */
import { amountInWords } from "./chequeReceipt";

const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: any) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const label = (s?: string) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface BillRow {
  invoiceNumber: string;
  plan: string;
  billingCycle: string;
  amount: number; // rupees actually paid (GST included)
  paidAt: string;
}
export interface BillBuyer {
  name?: string;
  address?: string;
  gst?: string;
  email?: string;
  phone?: string;
}

// ponytail: amount paid is treated as GST-inclusive (18%); change if plan prices are ever billed ex-GST.
export function printSubscriptionBill(b: BillRow, buyer: BillBuyer) {
  const total = Number(b.amount) || 0;
  const taxable = Math.round((total / 1.18) * 100) / 100;
  const gst = Math.round((total - taxable) * 100) / 100;
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(b.invoiceNumber)}</title><style>
  body{font:14px system-ui,Arial,sans-serif;margin:32px;color:#0a0a0a} h1{margin:0;font-size:22px;color:#024BAB}
  .box{border:2px solid #0a0a0a;padding:14px;margin-bottom:14px} table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #0a0a0a;padding:7px 9px;text-align:left} th{background:#024bab;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .r{text-align:right} .muted{color:#555;font-size:12px} .tag{display:inline-block;border:2px solid #0a0a0a;padding:2px 8px;font-weight:800;text-transform:uppercase;font-size:12px}
  .tot td{font-weight:800} @media print{button{display:none}}</style></head><body>
  <div class="box" style="display:flex;justify-content:space-between;gap:16px">
    <div><h1>Pixelate Nest</h1><div class="muted">NestGym — gym management software<br>sales@pixelatenest.com</div></div>
    <div style="text-align:right"><div class="tag">Tax Invoice</div><h1 style="margin-top:6px;color:#0a0a0a">${esc(b.invoiceNumber)}</h1><div class="muted">${dmy(b.paidAt)}</div><div class="tag" style="margin-top:6px">Paid</div></div>
  </div>
  <div class="box"><b>Billed to</b><br>${esc(buyer.name || "—")}<br><span class="muted">${esc(buyer.address || "")}${buyer.gst ? "<br>GSTIN: " + esc(buyer.gst) : ""}${buyer.email ? "<br>" + esc(buyer.email) : ""}${buyer.phone ? " · " + esc(buyer.phone) : ""}</span></div>
  <table><tr><th>Description</th><th>Term</th><th class="r">Amount</th></tr>
    <tr><td>NestGym ${esc(label(b.plan))} plan subscription</td><td>${esc(label(b.billingCycle))}</td><td class="r">${money(taxable)}</td></tr></table>
  <table style="margin-top:12px;width:55%;margin-left:auto">
    <tr><td>Taxable value</td><td class="r">${money(taxable)}</td></tr>
    <tr><td>CGST 9%</td><td class="r">${money(gst / 2)}</td></tr><tr><td>SGST 9%</td><td class="r">${money(gst / 2)}</td></tr>
    <tr class="tot"><td>Total paid</td><td class="r">${money(total)}</td></tr></table>
  <p class="muted" style="margin-top:14px">Amount in words: ${esc(amountInWords(total))}</p>
  <p class="muted">This is a computer generated bill and does not need a signature.</p>
  <button onclick="print()">Print / Save PDF</button>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
}
