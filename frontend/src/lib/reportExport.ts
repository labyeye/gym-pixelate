import * as XLSX from "xlsx";

// Same Print / CSV / Excel trio as NestHR, NestLeads and NestPlay reports.
// Print windows are same-origin and the login token lives in localStorage, so every
// interpolated value is escaped and the document gets a CSP that forbids scripts.
const CSP =
  '<meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface ReportSpec {
  title: string;
  period?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  company?: string;
  filename: string; // without extension
}

export function exportCSV({ headers, rows, filename }: ReportSpec) {
  const body = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([body], { type: "text/csv" })),
    download: `${filename}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportXLSX({ headers, rows, filename }: ReportSpec) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function printReport({ title, period = "", headers, rows, company }: ReportSpec) {
  const win = window.open("", "_blank");
  if (!win) return;
  const now = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
  const th = headers
    .map((h) => `<th style="background:#024BAB;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">${esc(h)}</th>`)
    .join("");
  const tr = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? "#F8FAFF" : "#fff"}">${r
          .map((c) => `<td style="padding:7px 10px;border-bottom:1px solid #E5E7EB;font-size:11px;white-space:nowrap">${esc(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const name = esc(company || "NestGym");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${CSP}<title>${esc(title)}</title>
<style>
@page{size:A4 landscape;margin:15mm 12mm 18mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:12px;color:#111}
.hd{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:3px solid #024BAB;padding-bottom:12px;margin-bottom:14px}
.co{font-size:17px;font-weight:700;color:#024BAB}.sub{font-size:9px;color:#9CA3AF;margin-top:2px}
.ti{text-align:center;font-size:15px;font-weight:700}.pe{font-size:11px;color:#6B7280;font-weight:400;margin-top:3px}
.gen{text-align:right;font-size:11px;font-weight:700}.gen small{display:block;font-size:8px;color:#9CA3AF;text-transform:uppercase;font-weight:400}
.stat{border-left:3px solid #024BAB;padding:4px 10px;margin-bottom:12px;display:inline-block}
.stat b{display:block;font-size:16px;color:#024BAB}.stat span{font-size:9px;color:#9CA3AF;text-transform:uppercase}
table{border-collapse:collapse;width:100%}thead{display:table-header-group}tr{page-break-inside:avoid}
.ft{margin-top:14px;border-top:1px solid #E5E7EB;padding-top:6px;display:flex;justify-content:space-between;font-size:9px;color:#9CA3AF}
</style></head><body>
<div class="hd"><div><div class="co">${name}</div><div class="sub">Gym Management System</div></div>
<div class="ti">${esc(title)}<div class="pe">${esc(period)}</div></div>
<div class="gen"><small>Report generated</small>${esc(now)}</div></div>
<div class="stat"><b>${rows.length}</b><span>Total records</span></div>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
<div class="ft"><span>${name} — Confidential Report</span><span>${esc(title)}${period ? " · " + esc(period) : ""}</span></div>
</body></html>`;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}
