import { useEffect, useRef, useState } from "react";
import { Download, Upload, Loader2, FileSpreadsheet, FileText, Plus, ChevronDown } from "lucide-react";
import { Modal } from "@/components/gym/kit";
import { downloadSheet, readRows } from "@/lib/spreadsheet";
import { exportTablePdf } from "@/lib/exportPdf";
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
  /** the page's "Add …" action; with an importer it becomes an Add ▾ menu: Manually / From Excel */
  add?: { label: string; onClick: () => void };
}

const btn =
  "flex items-center gap-1.5 px-3 py-2 bg-white text-blue-700 font-medium uppercase text-xs tracking-widest border-2 border-black whitespace-nowrap disabled:opacity-50";
const stamp = () => new Date().toISOString().slice(0, 10);

export function ExportImport<T>(p: Props<T>) {
  const notify = useNotify();
  const [busy, setBusy] = useState<"" | "export" | "import">("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) =>
      !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const doExport = async (ext: "xlsx" | "csv" | "pdf") => {
    setOpen(false);
    try {
      setBusy("export");
      const rows = p.fetchRows ? await p.fetchRows() : p.rows || [];
      const aoa = [
        p.cols.map((c) => c.header),
        ...rows.map((r) => p.cols.map((c) => c.value(r) ?? "")),
      ];
      if (ext === "pdf") exportTablePdf(p.name, aoa[0] as string[], aoa.slice(1) as any);
      else await downloadSheet(`${p.name}_${stamp()}`, aoa, ext, p.name);
    } catch (e: any) {
      notify.error("Export failed", e.message);
    } finally {
      setBusy("");
    }
  };

  const template = () => {
    if (!p.importTemplate) return;
    void downloadSheet(
      `${p.name}_template`,
      [p.importTemplate.headers, p.importTemplate.example],
      "xlsx",
      "Template",
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !p.onImportRow) return;
    setImportOpen(false);
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
    "w-full px-3 py-2 text-xs font-medium uppercase tracking-wider text-left cursor-pointer hover:bg-muted/50";
  return (
    <>
      <div className="relative" ref={menu}>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => setOpen((o) => !o)}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}{" "}
          Export <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {open && (
          <div
            className="absolute left-0 mt-1 w-48 bg-white border-2 border-black z-30"
          >
            <button className={`${item} flex items-center gap-2 text-emerald-700`} onClick={() => doExport("xlsx")}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
            </button>
            <button className={`${item} flex items-center gap-2 text-[#EF4444]`} onClick={() => doExport("pdf")}>
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
            <button className={`${item} flex items-center gap-2 text-blue-700`} onClick={() => doExport("csv")}>
              <FileText className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        )}
      </div>
      {p.onImportRow && (
        <>
          {!p.add && (
            <button
              type="button"
              className={cn(btn)}
              disabled={!!busy}
              onClick={() => setImportOpen(true)}
            >
              <Upload className="w-4 h-4" /> Import
            </button>
          )}
          <Modal
            open={importOpen}
            title="Import from Excel"
            subtitle="Upload a filled .xlsx or .csv sheet"
            onClose={() => setImportOpen(false)}
          >
            <div className="space-y-3">
              {p.importTemplate && (
                <button
                  type="button"
                  className={cn(btn, "w-full justify-center")}
                  onClick={template}
                >
                  <FileSpreadsheet className="w-4 h-4" /> Download template
                </button>
              )}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 px-4 py-6 bg-[#024BAB] text-white text-sm font-bold border-2 border-black"
                onClick={() => file.current?.click()}
              >
                <Upload className="w-4 h-4" /> Upload file (.xlsx / .csv)
              </button>
            </div>
          </Modal>
          <input
            ref={file}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFile}
          />
        </>
      )}
      {p.add && !p.onImportRow && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-green-600 font-medium uppercase text-xs tracking-widest border-2 border-black whitespace-nowrap"
          onClick={p.add.onClick}
        >
          <Plus className="w-3.5 h-3.5" /> {p.add.label}
        </button>
      )}
      {p.add && p.onImportRow && (
        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-green-600 font-medium uppercase text-xs tracking-widest border-2 border-black whitespace-nowrap"
            onClick={() => setAddOpen((o) => !o)}
          >
            <Plus className="w-3.5 h-3.5" /> {p.add.label}{" "}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {addOpen && (
            <div
              className="absolute left-0 mt-1 w-52 bg-white border-2 border-black z-30"
              onMouseLeave={() => setAddOpen(false)}
            >
              <button
                className={cn(item, "flex items-center gap-2 text-green-700")}
                onClick={() => {
                  setAddOpen(false);
                  p.add!.onClick();
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add manually
              </button>
              <button
                className={cn(item, "flex items-center gap-2 text-emerald-700")}
                onClick={() => {
                  setAddOpen(false);
                  setImportOpen(true);
                }}
              >
                <FileText className="w-3.5 h-3.5" /> Import Excel / CSV
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
