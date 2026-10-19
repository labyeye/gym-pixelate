/** Cheque-style member receipt (membership / invoice payments), designed in Settings > Receipt design. */

export interface ReceiptDesign {
  style: "standard" | "cheque";
  accent: string; // hex
  signatory: string; // printed under the signature line
  note: string; // small line at the bottom
  showWords: boolean; // amount in words
  showCrossing: boolean; // "A/C PAYEE" style crossing in the corner
  showLogo: boolean;
}

export const DEFAULT_RECEIPT_DESIGN: ReceiptDesign = {
  style: "standard",
  accent: "#024BAB",
  signatory: "Authorised Signatory",
  note: "This is a computer generated receipt. Membership fees once paid are non-refundable.",
  showWords: true,
  showCrossing: true,
  showLogo: true,
};

const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const below1000 = (n: number) =>
  (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? below100(n % 100) : "");

/** 123456.5 -> "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const total = Math.round(Math.abs(Number(amount) || 0) * 100);
  let rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (!rupees && !paise) return "Zero Rupees Only";
  const parts: string[] = [];
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

const inr2 = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d?: any) => {
  const x = d ? new Date(d) : new Date();
  return [String(x.getDate()).padStart(2, "0"), String(x.getMonth() + 1).padStart(2, "0"), String(x.getFullYear())];
};

export interface ChequeData {
  receiptNo: string;
  date?: any;
  receivedFrom: string;
  memberCode?: string;
  amount: number;
  towards: string;
  method?: string;
  reference?: string;
  balance?: number;
  company: { name?: string; address?: string; phone?: string; gst?: string; logoUrl?: string };
}

/** One full HTML document (A4 landscape) laid out like a bank cheque. */
export function chequeReceiptHtml(d: ChequeData, design: ReceiptDesign, autoPrint = false): string {
  const a = /^#[0-9a-f]{6}$/i.test(design.accent) ? design.accent : "#024BAB";
  const [dd, mm, yyyy] = dmy(d.date);
  const box = (txt: string) => txt.split("").map((c) => `<i>${c}</i>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.receiptNo)}</title><style>
  @page{size:A4 landscape;margin:12mm}
  *{box-sizing:border-box} body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
  .chq{position:relative;width:100%;max-width:1000px;margin:14px auto;border:2px solid ${a};background:linear-gradient(90deg,${a}14,#fff 45%,${a}0d);padding:18px 26px 14px;overflow:hidden}
  .chq:before{content:"${esc(d.company.name || "")}";position:absolute;right:-10px;top:42%;font-size:84px;font-weight:900;letter-spacing:6px;color:${a}0f;white-space:nowrap;transform:rotate(-8deg);pointer-events:none}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .co{display:flex;gap:12px;align-items:center}.co img{height:46px;max-width:120px;object-fit:contain}
  .co h1{margin:0;font-size:22px;color:${a}}.co p{margin:2px 0 0;font-size:11px;color:#444}
  .date{text-align:right;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#555}
  .date i{display:inline-block;width:20px;height:24px;border:1px solid ${a};margin-left:2px;text-align:center;line-height:24px;font-style:normal;font-size:14px;font-weight:700;color:#111;letter-spacing:0}
  .date span{display:inline-block;margin-left:8px}
  .row{display:flex;align-items:flex-end;gap:10px;margin-top:20px;font-size:14px}
  .row label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${a};white-space:nowrap}
  .line{flex:1;border-bottom:1.5px dotted #666;padding:0 6px 2px;font-weight:700;font-size:16px;min-height:24px}
  .amt{display:flex;align-items:center;gap:6px;margin-left:auto}
  .amt b{border:2px solid ${a};padding:6px 14px;font-size:22px;background:#fff;white-space:nowrap}
  .cross{position:absolute;left:26px;top:70px;transform:rotate(-12deg);border-top:2px solid #333;border-bottom:2px solid #333;padding:0 10px;font-size:11px;font-weight:800;letter-spacing:.1em;line-height:1.5}
  .foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;gap:20px}
  .meta{font-size:11px;color:#333;line-height:1.7}
  .sig{text-align:center;min-width:220px}.sig div{border-top:1.5px solid #111;padding-top:4px;font-size:11px;font-weight:700}
  .micr{margin-top:16px;border-top:1px dashed ${a};padding-top:8px;font-family:"Courier New",monospace;font-size:15px;letter-spacing:.22em;color:#222;display:flex;justify-content:space-between}
  .note{font-size:9.5px;color:#555;margin-top:6px}
  @media print{.chq{margin:0}}
  </style></head><body><div class="chq">
  <div class="top"><div class="co">${design.showLogo && d.company.logoUrl ? `<img src="${esc(d.company.logoUrl)}" alt="">` : ""}<div><h1>${esc(d.company.name || "Gym")}</h1><p>${esc(d.company.address || "")}${d.company.phone ? " · " + esc(d.company.phone) : ""}${d.company.gst ? "<br>GSTIN: " + esc(d.company.gst) : ""}</p></div></div>
  <div class="date">Date <span>${box(dd)}${box(mm)}${box(yyyy)}</span></div></div>
  ${design.showCrossing ? '<div class="cross">A/C PAYEE ONLY</div>' : ""}
  <div class="row" style="margin-top:34px"><label>Received from</label><div class="line">${esc(d.receivedFrom)}${d.memberCode ? ` <span style="font-weight:400;font-size:12px;color:#555">(${esc(d.memberCode)})</span>` : ""}</div></div>
  ${design.showWords ? `<div class="row"><label>Rupees</label><div class="line" style="font-size:14px">${esc(amountInWords(d.amount))}</div></div>` : ""}
  <div class="row"><label>Towards</label><div class="line">${esc(d.towards)}</div>
   <div class="amt"><label>₹</label><b>${inr2(d.amount)}/-</b></div></div>
  <div class="foot"><div class="meta"><b>Receipt No:</b> ${esc(d.receiptNo)}<br>${d.method ? `<b>Mode:</b> ${esc(String(d.method).replace(/_/g, " ").toUpperCase())}${d.reference ? " · Ref " + esc(d.reference) : ""}<br>` : ""}${d.balance && d.balance > 0 ? `<b>Balance due:</b> ₹${inr2(d.balance)}` : "<b>Paid in full</b>"}</div>
  <div class="sig"><div>${esc(design.signatory || "Authorised Signatory")}<br><span style="font-weight:400">for ${esc(d.company.name || "")}</span></div></div></div>
  <div class="micr"><span>⑆ ${esc(d.receiptNo.replace(/[^A-Za-z0-9]/g, ""))} ⑆</span><span>⑈ ${yyyy}${mm}${dd} ⑈ ${String(Math.round(d.amount * 100)).padStart(10, "0")} ⑈</span></div>
  ${design.note ? `<div class="note">${esc(design.note)}</div>` : ""}
  </div>${autoPrint ? "<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>" : ""}</body></html>`;
}

export const SAMPLE_CHEQUE: ChequeData = {
  receiptNo: "INV-00042",
  receivedFrom: "Rahul Sharma",
  memberCode: "GYM-00012",
  amount: 7080,
  towards: "Quarterly membership (01 Nov 2026 – 31 Jan 2027)",
  method: "upi",
  reference: "UPI123456",
  balance: 0,
  company: { name: "Your Gym", address: "Main Road, City", phone: "98765 43210", gst: "27ABCDE1234F1Z5" },
};
