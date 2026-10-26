import { useRef, useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { downloadSheet, readRows } from "@/lib/spreadsheet";
import { useNotify } from "@/components/ui/Notification";
import { cn } from "@/lib/utils";

export interface XCol<T = any> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

interface Props<T> {
  name: string;
  cols: XCol<T>[];
  /** rows to export (current list) — or fetch the full set on click */
  rows?: T[];
  fetchRows?: () => Promise<T[]>;
  /** import: template headers + one example row + a saver called per sheet row (header-keyed object) */
  importTemplate?: { headers: string[]; example: (string | number)[] };
  onImportRow?: (row: Record<string, any>) => Promise<any>;
  onImported?: () => void;
}

const btn =
  "flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 disabled:opacity-50";
const stamp = () => new Date().toISOString().slice(0, 10);

export function ExportImport<T>(p: Props<T>) {
  const notify = useNotify();
  const [busy, setBusy] = useState<"" | "export" | "import">("");
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const doExport = async (ext: "xlsx" | "csv") => {
    setOpen(false);
    try {
      setBusy("export");
      const rows = p.fetchRows ? await p.fetchRows() : p.rows || [];
      const aoa = [
        p.cols.map((c) => c.header),
        ...rows.map((r) => p.cols.map((c) => c.value(r) ?? "")),
      ];
      await downloadSheet(`${p.name}_${stamp()}`, aoa, ext, p.name);
    } catch (e: any) {
      notify.error("Export failed", e.message);
    } finally {
      setBusy("");
    }
  };

  const template = () => {
    if (!p.importTemplate) return;
    void downloadSheet(`${p.name}_template`, [p.importTemplate.headers, p.importTemplate.example], "xlsx", "Template");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !p.onImportRow) return;
    try {
      setBusy("import");
      const rows = await readRows(f);
      let ok = 0;
      const errs: string[] = [];
      // ponytail: sequential per-row save — fine for a few hundred rows; add a bulk endpoint if sheets get big
      for (let i = 0; i < rows.length; i++) {
        try {
          await p.onImportRow(rows[i]);
          ok++;
        } catch (err: any) {
          errs.push(`Row ${i + 2}: ${err.message}`);
        }
      }
      if (ok) p.onImported?.();
      if (errs.length)
        notify.error(
          `Imported ${ok}, ${errs.length} failed`,
          errs.slice(0, 3).join(" · "),
        );
      else notify.success(`Imported ${ok} row${ok === 1 ? "" : "s"}`);
    } catch (err: any) {
      notify.error("Import failed", err.message);
    } finally {
      setBusy("");
    }
  };

  const item =
    "w-full px-3 py-2 text-xs font-bold text-left hover:bg-[#024BAB]/10";
  return (
    <>
      <div className="relative">
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => setOpen((o) => !o)}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}{" "}
          Export
        </button>
        {open && (
          <div
            className="absolute right-0 mt-1 w-40 bg-white border-2 border-black z-30"
            onMouseLeave={() => setOpen(false)}
          >
            <button className={item} onClick={() => doExport("xlsx")}>
              Excel (.xlsx)
            </button>
            <button className={item} onClick={() => doExport("csv")}>
              CSV
            </button>
          </div>
        )}
      </div>
      {p.onImportRow && (
        <>
          <button
            type="button"
            className={cn(btn)}
            disabled={!!busy}
            onClick={() => file.current?.click()}
            title="Upload .xlsx / .csv"
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          {p.importTemplate && (
            <button
              type="button"
              className="text-xs font-bold underline self-center"
              onClick={template}
            >
              Template
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFile}
          />
        </>
      )}
    </>
  );
}
