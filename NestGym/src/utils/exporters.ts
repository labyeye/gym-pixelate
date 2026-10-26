import { Share } from 'react-native';
import RNPrint from 'react-native-print';

export interface ExportCol<T = any> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const csvCell = (v: unknown) => `"${text(v).replace(/"/g, '""')}"`;
const esc = (v: unknown) => text(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** CSV opens in Excel; handed to the phone's share sheet (save to Drive, send on WhatsApp, open in Excel...). */
export async function exportExcel<T>(name: string, cols: ExportCol<T>[], rows: T[]) {
  const csv = [cols.map(c => csvCell(c.header)).join(',')]
    .concat(rows.map(r => cols.map(c => csvCell(c.value(r))).join(',')))
    .join('\n');
  await Share.share({ message: csv, title: `${name}.csv` });
}

/** Opens the system print dialog, where "Save as PDF" is one tap. */
export async function exportPdf<T>(name: string, cols: ExportCol<T>[], rows: T[]) {
  const html = `<html><head><meta charset="utf-8"><style>
    body{font-family:sans-serif;font-size:10px;padding:12px}h2{margin:0 0 4px}p{margin:0 0 10px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}
    th{background:#024BAB;color:#fff}tr:nth-child(even){background:#f3f6fc}
  </style></head><body><h2>${esc(name)}</h2><p>${rows.length} row(s) · ${new Date().toLocaleDateString('en-IN')}</p><table><thead><tr>${cols
    .map(c => `<th>${esc(c.header)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(r => `<tr>${cols.map(c => `<td>${esc(c.value(r))}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></body></html>`;
  await RNPrint.print({ html });
}
