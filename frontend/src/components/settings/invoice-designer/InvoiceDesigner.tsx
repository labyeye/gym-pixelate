import React, { useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  ImagePlus,
  Loader2,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { InvoicePDFDocument } from "@/components/pdf/InvoicePDFDocument";
import { resolveLogo, settingsToCompany } from "@/lib/invoicePdf";
import {
  BLOCK_LABELS,
  PAGE_H,
  PAGE_W,
  PRESETS,
  defaultTemplate,
  localize,
  newBlock,
  newFloat,
  templateFor,
  normalizeTemplate,
  type BlockType,
  type DocKind,
  type Float,
  type InvoiceTemplate,
  type Theme,
} from "@/lib/invoiceTemplate";
import { QUOTATION_LABELS } from "@/lib/quotationPdf";
import { useHistoryState } from "@/hooks/useHistoryState";
import { settingsAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { cn } from "@/lib/utils";
import { DesignerCanvas, type Selection } from "./DesignerCanvas";
import { Inspector } from "./Inspector";
import { fileToDataUrl } from "./imageUtil";

const day = 86_400_000;
const INVOICE_LABELS = {
  number: "Invoice No.",
  date: "Invoice Date",
  due: "Due Date",
};
const SAMPLE = {
  title: "TAX INVOICE",
  labels: INVOICE_LABELS,
  client: {
    name: "Rahul Sharma",
    address: "12, Green Park Society",
    city: "Pune",
    state: "Maharashtra",
    pin: "411001",
    email: "rahul@example.com",
    phone: "9876543210",
  },
  invoice: {
    invoiceNo: "INV-0001",
    createdAt: new Date(),
    dueDate: new Date(Date.now() + 7 * day),
    taxPercent: 18,
    discount: 500,
    paidAmount: 5000,
    items: [
      {
        description: "Gold membership - 3 months",
        hsnCode: "999723",
        quantity: 1,
        price: 6000,
        details: "Qty: 1 x Rs. 6,000",
      },
      {
        description: "Personal training - 10 sessions",
        hsnCode: "999723",
        quantity: 10,
        price: 600,
        details: "Qty: 10 x Rs. 600",
      },
      {
        description: "Whey protein 1 kg",
        hsnCode: "2106",
        quantity: 1,
        price: 2400,
        details: "Qty: 1 x Rs. 2,400",
      },
    ],
  },
};

const ADDABLE: BlockType[] = [
  "note",
  "image",
  "spacer",
  "divider",
  "title",
  "header",
  "parties",
  "items",
  "words",
  "summary",
  "taxSummary",
  "footer",
];

const blockHint = (b: InvoiceTemplate["blocks"][number]) =>
  b.type === "note" ? String(b.props.text || "").slice(0, 24) : "";

const editing = (el: HTMLElement) =>
  el.tagName === "TEXTAREA" ||
  el.tagName === "SELECT" ||
  (el.tagName === "INPUT" &&
    !["range", "checkbox", "color", "file"].includes(
      (el as HTMLInputElement).type,
    ));

// One editor for both designs: kind "invoice" (invoices, sales orders, purchase orders) or "quotation".
export default function InvoiceDesigner({
  kind = "invoice",
  settings,
  active,
  onSaved,
}: {
  kind?: DocKind;
  settings: any;
  active: boolean;
  onSaved: (t: InvoiceTemplate) => void;
}) {
  const quotation = kind === "quotation";
  const field = quotation ? "quotationTemplate" : "invoiceTemplate";
  const sample = useMemo(
    () =>
      quotation
        ? {
            ...SAMPLE,
            title: settings?.quotationTitle || "PROFORMA INVOICE",
            labels: QUOTATION_LABELS,
            invoice: { ...SAMPLE.invoice, invoiceNo: "QT-0001" },
          }
        : SAMPLE,
    [quotation, settings?.quotationTitle],
  );
  const fresh = () =>
    localize(defaultTemplate(), kind, settings?.quotationFooter);
  const notify = useNotify();
  // the editor was written against the shadcn toast; route it to NestGym's notifications
  const toast = (o: { title: string; description?: string; variant?: string }) =>
    o.variant === "destructive" ? notify.error(o.title, o.description) : notify.success(o.title, o.description);
  const initial = useMemo(
    () => templateFor(kind, settings?.[field], settings?.quotationFooter),
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const {
    state: tpl,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistoryState<InvoiceTemplate>(initial);
  const savedRef = useRef<InvoiceTemplate>(initial); // dirty = the current object isn't the one last saved
  const [sel, setSel] = useState<Selection>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const company = useMemo(() => settingsToCompany(settings), [settings]);
  const logo = settings?.logoUrl || undefined;
  const dirty = tpl !== savedRef.current;

  // ---- edits (every one is undoable; `group` merges rapid changes into one undo step) ----
  const setTheme = (patch: Partial<Theme>, group: string) =>
    set((t) => ({ ...t, theme: { ...t.theme, ...patch } }), group);
  const setBlockProps = (
    id: string,
    patch: Record<string, any>,
    group: string,
  ) =>
    set(
      (t) => ({
        ...t,
        blocks: t.blocks.map((b) =>
          b.id === id ? { ...b, props: { ...b.props, ...patch } } : b,
        ),
      }),
      group,
    );
  const setFloat = (id: string, patch: Partial<Float>, group: string) =>
    set(
      (t) => ({
        ...t,
        floats: t.floats.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      }),
      group,
    );

  const moveBlock = (from: number, to: number) => {
    if (from === to || to < 0) return;
    set((t) => {
      if (to >= t.blocks.length) return t;
      const blocks = [...t.blocks];
      blocks.splice(to, 0, blocks.splice(from, 1)[0]);
      return { ...t, blocks };
    });
  };
  const toggleBlock = (id: string) =>
    set((t) => ({
      ...t,
      blocks: t.blocks.map((b) =>
        b.id === id ? { ...b, visible: !b.visible } : b,
      ),
    }));
  const toggleFloat = (id: string) =>
    set((t) => ({
      ...t,
      floats: t.floats.map((f) =>
        f.id === id ? { ...f, visible: !f.visible } : f,
      ),
    }));

  const remove = (s: NonNullable<Selection>) => {
    set((t) =>
      s.kind === "block"
        ? { ...t, blocks: t.blocks.filter((b) => b.id !== s.id) }
        : { ...t, floats: t.floats.filter((f) => f.id !== s.id) },
    );
    setSel(null);
  };

  const addBlock = (type: BlockType) => {
    const b = newBlock(type);
    set((t) => ({ ...t, blocks: [...t.blocks, b] }));
    setSel({ kind: "block", id: b.id });
  };

  const addFloat = (kind: Float["kind"], patch: Partial<Float> = {}) => {
    const f = newFloat(kind, patch);
    set((t) => ({ ...t, floats: [...t.floats, f] }));
    setSel({ kind: "float", id: f.id });
  };

  const addImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const src = await fileToDataUrl(file);
      const img = new Image();
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
        img.src = src;
      });
      const ratio =
        img.naturalWidth && img.naturalHeight
          ? img.naturalWidth / img.naturalHeight
          : 2;
      const w = 25;
      addFloat("image", {
        src,
        w,
        h: Math.min(60, (((w / 100) * PAGE_W) / ratio / PAGE_H) * 100),
        x: 60,
        y: 3,
      });
    } catch (x: any) {
      toast({
        title: "Could not add image",
        description: x.message,
        variant: "destructive",
      });
    }
  };

  const applyPreset = (key: string) => {
    if (!PRESETS[key]) return;
    set(localize(PRESETS[key].build(), kind, settings?.quotationFooter));
    setSel(null);
  };

  // ---- save / preview ----
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const clean = normalizeTemplate(tpl);
      const res = await settingsAPI.update({ [field]: clean });
      // The server echoes the saved design. If it is missing, this backend dropped it (an older build without the designer fields), so say so instead of pretending it saved.
      if (!res.data?.[field])
        throw new Error(
          "The server did not store the design. The backend needs the latest version deployed.",
        );
      const stored = normalizeTemplate(res.data[field]);
      savedRef.current = tpl;
      onSaved(stored);
      toast({
        title: quotation ? "Quotation design saved" : "Invoice design saved",
        description: quotation
          ? "New quotation PDFs will use it."
          : "New invoices, sales orders and purchase orders will use it.",
      });
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const previewPdf = async () => {
    const tab = window.open("", "_blank"); // opened inside the click so popup blockers allow it
    setPreviewing(true);
    try {
      const blob = await pdf(
        <InvoicePDFDocument
          invoice={sample.invoice}
          client={sample.client}
          company={company}
          logo={await resolveLogo(settings?.logoUrl)}
          title={sample.title}
          labels={sample.labels}
          template={tpl}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      toast({
        title: "Preview failed",
        description: "Could not build the PDF.",
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  // ---- keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+S, Delete, arrows (only while this tab is showing) ----
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (editing(e.target as HTMLElement)) return; // let text fields keep their own undo
      if (mod && key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (sel && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove(sel);
      } else if (sel?.kind === "float" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const f = tpl.floats.find((x) => x.id === sel.id);
        if (!f) return;
        const step = e.shiftKey ? 2 : 0.4;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setFloat(
          f.id,
          {
            x: Math.min(100 - f.w, Math.max(0, f.x + dx)),
            y: Math.min(100 - f.h, Math.max(0, f.y + dy)),
          },
          `nudge-${f.id}`,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const btn =
    "nb-btn px-3 py-1.5 text-xs font-bold border-2 border-black bg-white hover:bg-[#FFDE00]/40 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed";
  const rowCls = (on: boolean, over: boolean) =>
    cn(
      "flex items-center gap-1 border-2 px-1.5 py-1.5 text-xs font-bold bg-white cursor-pointer",
      on
        ? "border-[#024BAB] bg-[#024BAB]/10"
        : "border-black/20 hover:border-black",
      over && "border-t-4 border-t-[#024BAB]",
    );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[600px]">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 border-b-2 border-black bg-white">
        <button
          className={btn}
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button
          className={btn}
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" /> Redo
        </button>
        <select
          value=""
          onChange={(e) => applyPreset(e.target.value)}
          className="border-2 border-black px-2 py-1.5 text-xs font-bold bg-white"
          aria-label="Start from a preset"
        >
          <option value="">Start from preset…</option>
          {Object.entries(PRESETS).map(([k, p]) => (
            <option key={k} value={k}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          className={btn}
          onClick={() => {
            set(fresh());
            setSel(null);
          }}
          title="Back to the classic layout (you can undo this)"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <div className="flex-1" />
        {dirty && (
          <span className="text-[11px] font-bold text-amber-700">
            Unsaved changes
          </span>
        )}
        <button className={btn} onClick={previewPdf} disabled={previewing}>
          {previewing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}{" "}
          Preview PDF
        </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="nb-btn px-4 py-1.5 text-xs font-bold text-white border-2 border-black bg-[#024BAB] hover:bg-[#01368A] flex items-center gap-1.5 disabled:bg-gray-400 disabled:cursor-not-allowed"
          title="Ctrl+S"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}{" "}
          Save design
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_290px]">
        {/* layers */}
        <div className="border-b-2 lg:border-b-0 lg:border-r-2 border-black bg-white overflow-y-auto p-3 space-y-4 max-h-72 lg:max-h-none">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-black/50 mb-2">
              Layout (drag to reorder)
            </p>
            <div className="space-y-1">
              {tpl.blocks.map((b, i) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(i);
                  }}
                  onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
                  onDrop={() => {
                    if (dragFrom !== null) moveBlock(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onClick={() => setSel({ kind: "block", id: b.id })}
                  className={rowCls(
                    sel?.kind === "block" && sel.id === b.id,
                    dragOver === i && dragFrom !== null && dragFrom !== i,
                  )}
                >
                  <GripVertical className="w-3.5 h-3.5 text-black/40 shrink-0 cursor-grab" />
                  <span
                    className={cn(
                      "flex-1 truncate",
                      !b.visible && "opacity-40 line-through",
                    )}
                  >
                    {BLOCK_LABELS[b.type]}
                    {Number(b.props.w) > 0 && Number(b.props.w) < 100 ? (
                      <span className="font-black text-[#024BAB]">
                        {" "}
                        {Math.round(Number(b.props.w))}%
                      </span>
                    ) : null}
                    {blockHint(b) ? (
                      <span className="font-normal text-black/40">
                        {" "}
                        · {blockHint(b)}
                      </span>
                    ) : null}
                  </span>
                  <button
                    aria-label="Move up"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlock(i, i - 1);
                    }}
                    disabled={i === 0}
                    className="p-0.5 disabled:opacity-20"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    aria-label="Move down"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlock(i, i + 1);
                    }}
                    disabled={i === tpl.blocks.length - 1}
                    className="p-0.5 disabled:opacity-20"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    aria-label={b.visible ? "Hide" : "Show"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBlock(b.id);
                    }}
                    className="p-0.5"
                  >
                    {b.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
            <select
              value=""
              onChange={(e) =>
                e.target.value && addBlock(e.target.value as BlockType)
              }
              className="mt-2 w-full border-2 border-dashed border-black px-2 py-1.5 text-xs font-bold bg-white"
              aria-label="Add a block"
            >
              <option value="">+ Add block…</option>
              {ADDABLE.map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-black/50 mb-2">
              Images &amp; text on the page
            </p>
            <div className="flex gap-2 mb-2">
              <button
                className={cn(btn, "flex-1 justify-center")}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="w-3.5 h-3.5" /> Image
              </button>
              <button
                className={cn(btn, "flex-1 justify-center")}
                onClick={() => addFloat("text")}
              >
                <Type className="w-3.5 h-3.5" /> Text
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={addImage}
              />
            </div>
            <div className="space-y-1">
              {tpl.floats.length === 0 && (
                <p className="text-[11px] text-black/40">
                  Logo, stamp, watermark, QR code, badge… add any image and drag
                  it anywhere on the invoice.
                </p>
              )}
              {tpl.floats.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSel({ kind: "float", id: f.id })}
                  className={rowCls(
                    sel?.kind === "float" && sel.id === f.id,
                    false,
                  )}
                >
                  {f.kind === "image" ? (
                    <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Type className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "flex-1 truncate",
                      !f.visible && "opacity-40 line-through",
                    )}
                  >
                    {f.kind === "image"
                      ? "Image"
                      : f.text.slice(0, 22) || "Text"}
                  </span>
                  <button
                    aria-label={f.visible ? "Hide" : "Show"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFloat(f.id);
                    }}
                    className="p-0.5"
                  >
                    {f.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove({ kind: "float", id: f.id });
                    }}
                    className="p-0.5 text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* canvas */}
        <div className="overflow-auto bg-[#e5e7eb] p-4 sm:p-6">
          <DesignerCanvas
            template={tpl}
            company={company}
            logo={logo}
            sample={sample}
            selection={sel}
            onSelect={setSel}
            onFloatChange={setFloat}
            onBlockProps={setBlockProps}
          />
          <p className="text-center text-[11px] text-black/50 mt-3">
            Preview with sample data. Press <b>Preview PDF</b> for the exact
            output.
          </p>
        </div>

        {/* inspector */}
        <div className="border-t-2 lg:border-t-0 lg:border-l-2 border-black bg-white overflow-y-auto p-4">
          <Inspector
            template={tpl}
            selection={sel}
            onTheme={setTheme}
            onBlockProps={setBlockProps}
            onFloat={setFloat}
            onRemove={remove}
          />
        </div>
      </div>
    </div>
  );
}
