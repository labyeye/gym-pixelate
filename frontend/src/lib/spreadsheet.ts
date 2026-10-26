// Spreadsheet read / write without the vulnerable `xlsx` package. exceljs is loaded only when an .xlsx is touched.

// A cell that starts with = + - @ is run as a formula by Excel / Sheets: prefix it so exported data can't execute.
const safe = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
};
const keepNumber = (v: unknown) => (typeof v === "number" ? v : safe(v));

const save = (blob: Blob, filename: string) => {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
};

export const toCsv = (aoa: unknown[][]) =>
  aoa.map((r) => r.map((c) => `"${safe(c).replace(/"/g, '""')}"`).join(",")).join("\n");

/** Downloads rows (first row = headers) as .xlsx or .csv. */
export async function downloadSheet(filename: string, aoa: unknown[][], ext: "xlsx" | "csv", sheetName = "Sheet1") {
  if (ext === "csv") return save(new Blob(["\uFEFF" + toCsv(aoa)], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  aoa.forEach((r) => ws.addRow(r.map(keepNumber)));
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Reads the first sheet of an .xlsx / .csv file into objects keyed by the header row. */
export async function readRows(file: File): Promise<Record<string, any>[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("That file is larger than 5 MB");
  let grid: string[][];
  if (/\.csv$/i.test(file.name)) grid = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  else {
    const { Workbook } = await import("exceljs");
    const wb = new Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    grid = [];
    ws.eachRow((r) => {
      const vals = (r.values as any[]).slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "object") return String((v as any).text ?? (v as any).result ?? "");
        return String(v);
      });
      grid.push(vals);
    });
  }
  const [head, ...body] = grid;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [String(h).trim(), r[i] ?? ""])));
}
