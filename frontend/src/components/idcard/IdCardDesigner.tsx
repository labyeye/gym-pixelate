import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ArrowDown,
  ArrowUp,
  Building2,
  Copy,
  Database,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  MoveHorizontal,
  Printer,
  QrCode,
  Redo2,
  Save,
  Shapes,
  Trash2,
  Type,
  Undo2,
  Upload,
  User,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { settingsAPI } from "@/services/api";
import { gym } from "@/services/gymApi";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { IdCardView, assetUrl } from "@/components/idcard/IdCardView";
import { IdCardLibrary } from "@/components/idcard/IdCardLibrary";
import { loadIdCardSetup } from "@/lib/idCardData";
import { buildQrMap } from "@/lib/idCardQr";
import { printIdCards } from "@/lib/printIdCards";
import {
  FIELD_OPTIONS,
  FONT_LABELS,
  KIND_LABELS,
  PX_PER_MM,
  SAMPLE_EMPLOYEE,
  SIZE_OPTIONS,
  cardDims,
  makeEl,
  qrValue,
  type ElKind,
  type FontKey,
  type IdCardTemplate,
  type IdCompany,
  type IdEl,
} from "@/lib/idCard";

const KIND_ICONS: Record<ElKind, typeof Type> = {
  text: Type,
  field: Database,
  photo: User,
  logo: Building2,
  qr: QrCode,
  shape: Shapes,
  image: ImageIcon,
};

const BASE_SWATCHES = [
  "#000000", "#111827", "#475569", "#94a3b8", "#ffffff",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#1e3a8f",
  "#8b5cf6", "#d946ef", "#ec4899", "#9f1239", "#78350f",
];

const round = (n: number) => Math.round(n * 2) / 2; // snap to 0.5 %
const MAX_UPLOAD = 5 * 1024 * 1024;

type Drag = {
  id: string;
  mode: "move" | "resize";
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
};

const inputCls =
  "w-full border-2 border-black px-2 py-1 text-xs font-medium bg-white outline-none focus:border-[#024BAB]";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-black mb-0.5";
const iconBtn = "p-1 border-2 border-black hover:bg-[#024BAB]/10";

function Num({
  label,
  value,
  onChange,
  step = 0.5,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        className={inputCls}
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "border-2 border-black px-2 py-1 text-xs font-bold transition-colors",
        on ? "bg-[#024BAB] text-white" : "bg-white hover:bg-[#024BAB]/5",
      )}
    >
      {label}
    </button>
  );
}

/** A colour picker with a hex box and clickable swatches (the design's own colours first, then a basic set). */
function ColorField({
  label,
  value,
  onChange,
  swatches,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  swatches: string[];
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          className="h-7 w-9 border-2 border-black bg-white p-0 shrink-0"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className={cn(inputCls, "font-mono")}
          value={hex}
          maxLength={7}
          onChange={(e) => {
            setHex(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={cn(
              "h-4 w-4 border border-black/40",
              c.toLowerCase() === value.toLowerCase() && "ring-2 ring-[#024BAB] ring-offset-1",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

const imgSize = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const i = new window.Image();
    i.onload = () => resolve({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 });
    i.onerror = () => resolve({ w: 1, h: 1 });
    i.src = src;
  });

export function IdCardDesigner() {
  const { toast } = useToast();
  const [template, setTemplate] = useState<IdCardTemplate | null>(null);
  const [company, setCompany] = useState<IdCompany | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [side, setSide] = useState<"front" | "back">("front");
  const [selId, setSelId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const drag = useRef<Drag | null>(null);

  // ── undo / redo: snapshots of the whole design; a quick run of edits (a drag, typing) counts as one step ──
  const tplRef = useRef<IdCardTemplate | null>(null);
  const past = useRef<IdCardTemplate[]>([]);
  const future = useRef<IdCardTemplate[]>([]);
  const lastPush = useRef(0);
  const [, setHist] = useState(0);
  const setTpl = useCallback((fn: (t: IdCardTemplate) => IdCardTemplate) => {
    const prev = tplRef.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    if (now - lastPush.current > 700) {
      past.current.push(prev);
      if (past.current.length > 80) past.current.shift();
    }
    lastPush.current = now;
    future.current = [];
    tplRef.current = next;
    setTemplate(next);
    setHist((h) => h + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !tplRef.current) return;
    future.current.push(tplRef.current);
    tplRef.current = prev;
    lastPush.current = 0;
    setTemplate(prev);
    setHist((h) => h + 1);
  }, []);
  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt || !tplRef.current) return;
    past.current.push(tplRef.current);
    tplRef.current = nxt;
    lastPush.current = 0;
    setTemplate(nxt);
    setHist((h) => h + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // keep the browser's own undo in fields
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── canvas zoom ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 560, h: 620 });
  const [zoomSel, setZoomSel] = useState<"fit" | number>("fit");
  const zoomRef = useRef(1);
  const loaded = !!template;

  // ── file picking (images) ──
  const fileInput = useRef<HTMLInputElement>(null);
  const onFile = useRef<((f: File) => void) | null>(null);
  const askFile = (cb: (f: File) => void) => {
    onFile.current = cb;
    fileInput.current?.click();
  };
  const uploadImage = async (file: File): Promise<string | null> => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast({ title: "Unsupported image", description: "Use a PNG, JPG or WebP image.", variant: "destructive" });
      return null;
    }
    if (file.size > MAX_UPLOAD) {
      toast({ title: "Image too large", description: "Please use an image under 5 MB.", variant: "destructive" });
      return null;
    }
    setUploading(true);
    try {
      const res = await settingsAPI.uploadIdCardImage(file);
      return res.url;
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      loadIdCardSetup(),
      gym.members.list({ status: "active", limit: 100 }).catch(() => null),
    ])
      .then(([setup, emps]) => {
        tplRef.current = setup.template;
        setTemplate(setup.template);
        setCompany(setup.company);
        setSavedJson(setup.saved ? JSON.stringify(setup.template) : "");
        if (emps?.data) setEmployees(emps.data);
      })
      .catch((e) => setError(e.message || "Could not load the designer"));
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () =>
      setAvail({
        w: Math.max(200, el.clientWidth - 32),
        h: Math.max(380, window.innerHeight - 300),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const next = zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
      setZoomSel(Math.min(4, Math.max(0.5, next)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      el.removeEventListener("wheel", onWheel);
    };
  }, [loaded]);

  const previewEmp = useMemo(
    () => employees.find((e) => e._id === previewId) || employees[0] || SAMPLE_EMPLOYEE,
    [employees, previewId],
  );

  useEffect(() => {
    if (!template || !company) return;
    const vals: string[] = [];
    for (const s of [template.front, template.back])
      for (const el of s.elements)
        if (el.kind === "qr") vals.push(qrValue(el, previewEmp, company));
    buildQrMap(vals).then(setQrMap);
  }, [template, company, previewEmp]);

  const dirty = !!template && JSON.stringify(template) !== savedJson;
  const cur = template ? (side === "front" ? template.front : template.back) : null;
  const sel = cur?.elements.find((e) => e.id === selId) || null;

  // the design's own colours, for the swatch rows
  const usedColors = useMemo(() => {
    if (!template) return [] as string[];
    const set = new Set<string>();
    for (const s of [template.front, template.back]) {
      set.add(s.bg);
      if (s.bg2) set.add(s.bg2);
      for (const e of s.elements) {
        set.add(e.color);
        if (e.kind === "shape") {
          set.add(e.fill);
          if (e.fill2) set.add(e.fill2);
        }
        if (e.borderWidth > 0) set.add(e.borderColor);
      }
    }
    return [...set].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 10);
  }, [template]);
  const swatches = useMemo(
    () => [...new Set([...usedColors, ...BASE_SWATCHES].map((c) => c.toLowerCase()))],
    [usedColors],
  );

  const setSideEls = useCallback(
    (fn: (els: IdEl[]) => IdEl[]) =>
      setTpl((t) =>
        side === "front"
          ? { ...t, front: { ...t.front, elements: fn(t.front.elements) } }
          : { ...t, back: { ...t.back, elements: fn(t.back.elements) } },
      ),
    [side, setTpl],
  );
  const patchSide = (patch: Partial<IdCardTemplate["front"]>) =>
    setTpl((t) =>
      side === "front" ? { ...t, front: { ...t.front, ...patch } } : { ...t, back: { ...t.back, ...patch } },
    );
  const patchEl = (id: string, patch: Partial<IdEl>) =>
    setSideEls((els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addEl = (kind: ElKind, over: Partial<IdEl> = {}) => {
    const el = makeEl(kind, over);
    setSideEls((els) => [...els, el]);
    setSelId(el.id);
  };
  const removeEl = (id: string) => {
    setSideEls((els) => els.filter((e) => e.id !== id));
    setSelId((s) => (s === id ? null : s));
  };
  const dupEl = (id: string) => {
    const src = cur?.elements.find((e) => e.id === id);
    if (!src) return;
    const { id: _drop, ...rest } = src; // a copy gets a fresh id from makeEl
    void _drop;
    const copy = makeEl(src.kind, { ...rest, x: src.x + 3, y: src.y + 3 });
    setSideEls((els) => [...els, copy]);
    setSelId(copy.id);
  };
  const moveEl = (id: string, dir: -1 | 1) =>
    setSideEls((els) => {
      const i = els.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= els.length) return els;
      const next = [...els];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // add an uploaded image sized to its own proportions
  const addImage = () =>
    askFile(async (file) => {
      const url = await uploadImage(file);
      if (!url || !template) return;
      const { w: iw, h: ih } = await imgSize(assetUrl(url));
      const d = cardDims(template);
      let wMm = d.w * 0.4;
      let hMm = (wMm * ih) / iw;
      if (hMm > d.h * 0.8) {
        hMm = d.h * 0.8;
        wMm = (hMm * iw) / ih;
      }
      addEl("image", { src: url, w: round((wMm / d.w) * 100), h: round((hMm / d.h) * 100), x: 10, y: 10 });
    });
  const replaceImage = (id: string) =>
    askFile(async (file) => {
      const url = await uploadImage(file);
      if (url) patchEl(id, { src: url });
    });
  const setBackgroundImage = () =>
    askFile(async (file) => {
      const url = await uploadImage(file);
      if (url) patchSide({ bgImage: url });
    });

  const applyTemplate = (t: IdCardTemplate) => {
    setTpl(() => t);
    setSelId(null);
    setSide("front");
    setShowLibrary(false);
    setZoomSel("fit");
    toast({
      title: "Template loaded",
      description: "Not saved yet. Edit it, then click Save design. Ctrl/Cmd + Z undoes this.",
    });
  };

  const align = (id: string, how: "h" | "v" | "full") => {
    const e = cur?.elements.find((x) => x.id === id);
    if (!e) return;
    if (how === "h") patchEl(id, { x: round((100 - e.w) / 2) });
    else if (how === "v") patchEl(id, { y: round((100 - e.h) / 2) });
    else patchEl(id, { x: 0, w: 100 });
  };

  const save = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await settingsAPI.update({ idCardTemplate: template });
      setSavedJson(JSON.stringify(template));
      toast({ title: "ID card design saved", description: "It's now used when you print ID cards." });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const printTest = async () => {
    if (!template || !company) return;
    const ok = await printIdCards({
      employees: [previewEmp],
      template,
      company,
      sides: template.backEnabled ? "both" : "front",
      layout: "cards",
    });
    if (!ok)
      toast({ title: "Pop-up blocked", description: "Allow pop-ups for this site to print.", variant: "destructive" });
  };

  if (error) return <p className="text-sm font-bold text-[#EF4444]">{error}</p>;
  if (!template || !company || !cur)
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );

  const { w, h } = cardDims(template);
  const fitZoom = Math.max(0.5, Math.min(avail.w / (w * PX_PER_MM), avail.h / (h * PX_PER_MM), 3.5));
  const zoom = zoomSel === "fit" ? fitZoom : zoomSel;
  zoomRef.current = zoom;
  const stepZoom = (f: number) => setZoomSel(Math.min(4, Math.max(0.5, zoom * f)));
  const Wpx = w * PX_PER_MM * zoom;
  const Hpx = h * PX_PER_MM * zoom;

  // ── drag / resize on the canvas ──
  const startDrag = (e: React.PointerEvent, el: IdEl, mode: Drag["mode"]) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelId(el.id);
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / Wpx) * 100;
    const dy = ((e.clientY - d.sy) / Hpx) * 100;
    if (d.mode === "move") patchEl(d.id, { x: round(d.ox + dx), y: round(d.oy + dy) });
    else patchEl(d.id, { w: Math.max(0.5, round(d.ow + dx)), h: Math.max(0.5, round(d.oh + dy)) });
  };
  const onUp = () => {
    drag.current = null;
  };
  const onKey = (e: React.KeyboardEvent, el: IdEl) => {
    const step = e.shiftKey ? 2 : 0.5;
    if (e.key === "ArrowLeft") patchEl(el.id, { x: el.x - step });
    else if (e.key === "ArrowRight") patchEl(el.id, { x: el.x + step });
    else if (e.key === "ArrowUp") patchEl(el.id, { y: el.y - step });
    else if (e.key === "ArrowDown") patchEl(el.id, { y: el.y + step });
    else if (e.key === "Delete" || e.key === "Backspace") removeEl(el.id);
    else return;
    e.preventDefault();
  };

  const isText = sel && (sel.kind === "text" || sel.kind === "field");
  const hasBorder = sel && (sel.kind === "photo" || sel.kind === "image" || sel.kind === "shape");
  const hasShape = sel && (sel.kind === "photo" || sel.kind === "image" || sel.kind === "shape");

  return (
    <div className="space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile.current?.(f);
        }}
      />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex border-2 border-black bg-white">
          {(["front", "back"] as const).map((s) => (
            <button
              key={s}
              disabled={s === "back" && !template.backEnabled}
              onClick={() => {
                setSide(s);
                setSelId(null);
              }}
              className={cn(
                "px-4 py-2 text-sm font-bold border-r-2 border-black last:border-r-0 capitalize disabled:opacity-40",
                side === s ? "bg-[#024BAB] text-white" : "bg-white hover:bg-[#024BAB]/5",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowLibrary(true)}
          className="border-2 border-black bg-white px-3 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-[#024BAB]/5"
        >
          <LayoutTemplate className="w-4 h-4" /> Templates
        </button>
        <div className="inline-flex border-2 border-black bg-white">
          <button
            onClick={undo}
            disabled={past.current.length === 0}
            title="Undo (Ctrl/Cmd + Z)"
            className="px-2.5 py-2 border-r-2 border-black disabled:opacity-35 hover:bg-[#024BAB]/10"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={future.current.length === 0}
            title="Redo (Ctrl/Cmd + Shift + Z)"
            className="px-2.5 py-2 disabled:opacity-35 hover:bg-[#024BAB]/10"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
        <select
          value={previewId}
          onChange={(e) => setPreviewId(e.target.value)}
          className="border-2 border-black bg-white px-3 py-2 text-sm font-semibold outline-none max-w-[220px]"
          title="Whose data to preview"
        >
          <option value="">
            Preview: {employees[0] ? `${employees[0].name}` : "sample member"}
          </option>
          {employees.map((e) => (
            <option key={e._id} value={e._id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button
            onClick={printTest}
            className="border-2 border-black bg-white px-3 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-[#024BAB]/5"
          >
            <Printer className="w-4 h-4" /> Test print
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="border-2 border-black bg-[#024BAB] text-white px-4 py-2 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {dirty ? "Save design" : "Saved"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[230px_minmax(0,1fr)_260px] gap-4 items-start">
        {/* Left: design settings, add, layers */}
        <div className="space-y-4">
          <div className="border-2 border-black bg-white p-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider">Card</p>
            <div>
              <label className={labelCls}>Size</label>
              <select
                className={inputCls}
                value={template.size}
                onChange={(e) => setTpl((t) => ({ ...t, size: e.target.value as any }))}
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {template.size === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Num label="Width mm" value={template.customW} min={30} max={210} step={1} onChange={(v) => setTpl((t) => ({ ...t, customW: v }))} />
                <Num label="Height mm" value={template.customH} min={30} max={297} step={1} onChange={(v) => setTpl((t) => ({ ...t, customH: v }))} />
              </div>
            )}
            <Num label="Corner radius (mm)" value={template.cornerRadius} min={0} max={10} step={0.5} onChange={(v) => setTpl((t) => ({ ...t, cornerRadius: v }))} />
            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={template.backEnabled}
                onChange={(e) => {
                  setTpl((t) => ({ ...t, backEnabled: e.target.checked }));
                  if (!e.target.checked) setSide("front");
                }}
                className="w-4 h-4 accent-[#024BAB]"
              />
              Design a back side
            </label>
          </div>

          <div className="border-2 border-black bg-white p-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider">Background ({side})</p>
            <ColorField label="Colour" value={cur.bg} swatches={swatches} onChange={(v) => patchSide({ bg: v })} />
            <Toggle
              label={cur.bg2 ? "Gradient on" : "Add gradient"}
              on={!!cur.bg2}
              onChange={(on) => patchSide({ bg2: on ? cur.bg2 || "#f59e0b" : "" })}
            />
            {cur.bg2 && (
              <>
                <ColorField label="Second colour" value={cur.bg2} swatches={swatches} onChange={(v) => patchSide({ bg2: v })} />
                <div>
                  <label className={labelCls}>Angle {cur.bgAngle ?? 135}°</label>
                  <input type="range" min={0} max={360} value={cur.bgAngle ?? 135} onChange={(e) => patchSide({ bgAngle: Number(e.target.value) })} className="w-full accent-[#024BAB]" />
                </div>
              </>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={setBackgroundImage}
                disabled={uploading}
                className="flex-1 border-2 border-black bg-white px-2 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#024BAB]/5 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {cur.bgImage ? "Replace image" : "Background image"}
              </button>
              {cur.bgImage && (
                <button onClick={() => patchSide({ bgImage: "" })} title="Remove background image" className={cn(iconBtn, "text-[#EF4444]")}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="border-2 border-black bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wider mb-2">Add to {side}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["text", "field", "photo", "logo", "qr", "shape"] as ElKind[]).map((k) => {
                const Icon = KIND_ICONS[k] ?? Shapes;
                return (
                  <button
                    key={k}
                    onClick={() => addEl(k)}
                    className="border-2 border-black bg-white px-2 py-1.5 text-xs font-bold flex items-center gap-1.5 hover:bg-[#024BAB]/5"
                  >
                    <Icon className="w-3.5 h-3.5" /> {KIND_LABELS[k]}
                  </button>
                );
              })}
              <button
                onClick={addImage}
                disabled={uploading}
                className="col-span-2 border-2 border-black bg-white px-2 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#024BAB]/5 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                Upload image
              </button>
            </div>
          </div>

          <div className="border-2 border-black bg-white">
            <p className="text-xs font-bold uppercase tracking-wider p-3 pb-2">Layers (top first)</p>
            <ul className="max-h-64 overflow-auto divide-y divide-black/10">
              {[...cur.elements].reverse().map((el) => {
                const Icon = KIND_ICONS[el.kind] ?? Shapes;
                const label =
                  el.kind === "field"
                    ? FIELD_OPTIONS.find((f) => f.key === el.field)?.label
                    : el.kind === "text"
                      ? el.text.slice(0, 18) || "Text"
                      : KIND_LABELS[el.kind];
                return (
                  <li
                    key={el.id}
                    onClick={() => setSelId(el.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-[#024BAB]/5",
                      el.id === selId && "bg-[#024BAB]/10 font-bold",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    <button
                      title={el.visible ? "Hide" : "Show"}
                      onClick={(e) => {
                        e.stopPropagation();
                        patchEl(el.id, { visible: !el.visible });
                      }}
                    >
                      {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-40" />}
                    </button>
                  </li>
                );
              })}
              {cur.elements.length === 0 && (
                <li className="px-3 py-3 text-xs text-muted-foreground">Nothing here yet. Add an element above.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Centre: canvas */}
        <div className="border-2 border-black bg-[#E5E7EB] min-w-0">
          <div className="flex items-center justify-center gap-1.5 p-2 border-b-2 border-black bg-white">
            <button onClick={() => stepZoom(1 / 1.2)} title="Zoom out" className="p-1.5 border-2 border-black bg-white hover:bg-[#024BAB]/10">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold w-14 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => stepZoom(1.2)} title="Zoom in" className="p-1.5 border-2 border-black bg-white hover:bg-[#024BAB]/10">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomSel("fit")}
              title="Fit the card to this area"
              className={cn(
                "px-2.5 py-1.5 text-xs font-bold border-2 border-black",
                zoomSel === "fit" ? "bg-[#024BAB] text-white" : "bg-white hover:bg-[#024BAB]/10",
              )}
            >
              Fit
            </button>
            <button onClick={() => setZoomSel(1)} title="Real card size" className="px-2.5 py-1.5 text-xs font-bold border-2 border-black bg-white hover:bg-[#024BAB]/10">
              100%
            </button>
          </div>
          <div ref={canvasRef} className="p-4 overflow-auto" style={{ maxHeight: Math.max(420, avail.h + 40) }}>
            <div className="mx-auto" style={{ width: Wpx, height: Hpx }}>
              <div className="relative" style={{ width: Wpx, height: Hpx, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>
                  <IdCardView template={template} side={side} employee={previewEmp} company={company} qrMap={qrMap} />
                </div>
                {/* hit boxes */}
                <div className="absolute inset-0" onPointerDown={() => setSelId(null)}>
                  {cur.elements.map((el) => {
                    const on = el.id === selId;
                    return (
                      <div
                        key={el.id}
                        tabIndex={0}
                        onKeyDown={(e) => onKey(e, el)}
                        onPointerDown={(e) => startDrag(e, el, "move")}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        style={{
                          position: "absolute",
                          left: `${el.x}%`,
                          top: `${el.y}%`,
                          width: `${el.w}%`,
                          height: `${el.h}%`,
                          cursor: "move",
                          touchAction: "none",
                          transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
                          outline: on ? "2px solid #024BAB" : "1px dashed rgba(2,75,171,.35)",
                          background: on ? "rgba(2,75,171,.08)" : "transparent",
                          opacity: el.visible ? 1 : 0.4,
                        }}
                      >
                        {on && (
                          <div
                            onPointerDown={(e) => startDrag(e, el, "resize")}
                            onPointerMove={onMove}
                            onPointerUp={onUp}
                            style={{
                              position: "absolute",
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              background: "#024BAB",
                              border: "2px solid #fff",
                              cursor: "nwse-resize",
                              touchAction: "none",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Drag an element to move it, drag the blue corner to resize, arrow keys nudge (Shift = bigger steps).
              Zoom with the buttons or Ctrl / Cmd + scroll. Ctrl / Cmd + Z undoes.
            </p>
          </div>
        </div>

        {/* Right: inspector */}
        <div className="border-2 border-black bg-white p-3 space-y-3">
          {!sel ? (
            <p className="text-xs text-muted-foreground">
              Select an element on the card to edit it. Colours, borders, gradients, rotation and your own images are all
              available here.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider">{KIND_LABELS[sel.kind]}</p>
                <div className="flex gap-1">
                  <button title="Bring forward" onClick={() => moveEl(sel.id, 1)} className={iconBtn}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button title="Send backward" onClick={() => moveEl(sel.id, -1)} className={iconBtn}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button title="Duplicate" onClick={() => dupEl(sel.id)} className={iconBtn}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button title="Delete" onClick={() => removeEl(sel.id)} className={cn(iconBtn, "hover:bg-[#EF4444]/10 text-[#EF4444]")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Num label="X %" value={sel.x} onChange={(v) => patchEl(sel.id, { x: v })} />
                <Num label="Y %" value={sel.y} onChange={(v) => patchEl(sel.id, { y: v })} />
                <Num label="Width %" value={sel.w} min={0.2} onChange={(v) => patchEl(sel.id, { w: v })} />
                <Num label="Height %" value={sel.h} min={0.2} onChange={(v) => patchEl(sel.id, { h: v })} />
              </div>
              <div className="flex gap-1.5">
                <button title="Centre horizontally on the card" onClick={() => align(sel.id, "h")} className={cn(iconBtn, "flex-1 flex justify-center")}>
                  <AlignHorizontalJustifyCenter className="w-4 h-4" />
                </button>
                <button title="Centre vertically on the card" onClick={() => align(sel.id, "v")} className={cn(iconBtn, "flex-1 flex justify-center")}>
                  <AlignVerticalJustifyCenter className="w-4 h-4" />
                </button>
                <button title="Full card width" onClick={() => align(sel.id, "full")} className={cn(iconBtn, "flex-1 flex justify-center")}>
                  <MoveHorizontal className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className={labelCls}>Rotate {Math.round(sel.rotate)}°</label>
                <input type="range" min={-180} max={180} value={sel.rotate} onChange={(e) => patchEl(sel.id, { rotate: Number(e.target.value) })} className="w-full accent-[#024BAB]" />
                {sel.rotate !== 0 && (
                  <button onClick={() => patchEl(sel.id, { rotate: 0 })} className="text-[11px] font-bold text-[#024BAB] underline">
                    Reset rotation
                  </button>
                )}
              </div>

              {sel.kind === "text" && (
                <div>
                  <label className={labelCls}>Text</label>
                  <textarea rows={3} maxLength={200} className={inputCls} value={sel.text} onChange={(e) => patchEl(sel.id, { text: e.target.value })} />
                </div>
              )}

              {sel.kind === "field" && (
                <>
                  <div>
                    <label className={labelCls}>Shows</label>
                    <select className={inputCls} value={sel.field} onChange={(e) => patchEl(sel.id, { field: e.target.value as any })}>
                      {["Member", "Company"].map((g) => (
                        <optgroup key={g} label={g}>
                          {FIELD_OPTIONS.filter((f) => f.group === g).map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Label before it</label>
                    <input className={inputCls} maxLength={40} placeholder='e.g. "ID: "' value={sel.prefix} onChange={(e) => patchEl(sel.id, { prefix: e.target.value })} />
                  </div>
                </>
              )}

              {isText && (
                <>
                  <ColorField label="Text colour" value={sel.color} swatches={swatches} onChange={(v) => patchEl(sel.id, { color: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="Size (pt)" value={sel.size} min={4} max={60} step={0.5} onChange={(v) => patchEl(sel.id, { size: v })} />
                    <Num label="Letter spacing (em)" value={sel.spacing} min={0} max={0.5} step={0.02} onChange={(v) => patchEl(sel.id, { spacing: v })} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Toggle label="Bold" on={sel.bold} onChange={(v) => patchEl(sel.id, { bold: v })} />
                    <Toggle label="Italic" on={sel.italic} onChange={(v) => patchEl(sel.id, { italic: v })} />
                    <Toggle label="CAPS" on={sel.upper} onChange={(v) => patchEl(sel.id, { upper: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Align</label>
                      <select className={inputCls} value={sel.align} onChange={(e) => patchEl(sel.id, { align: e.target.value as any })}>
                        <option value="left">Left</option>
                        <option value="center">Centre</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Font</label>
                      <select className={inputCls} value={sel.font} onChange={(e) => patchEl(sel.id, { font: e.target.value as FontKey })}>
                        {(Object.keys(FONT_LABELS) as FontKey[]).map((k) => (
                          <option key={k} value={k}>
                            {FONT_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {sel.kind === "image" && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => replaceImage(sel.id)}
                      disabled={uploading}
                      className="flex-1 border-2 border-black bg-white px-2 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#024BAB]/5 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Replace image
                    </button>
                  </div>
                  <div>
                    <label className={labelCls}>Fit</label>
                    <select className={inputCls} value={sel.fit} onChange={(e) => patchEl(sel.id, { fit: e.target.value as any })}>
                      <option value="cover">Fill the box (crop)</option>
                      <option value="contain">Fit inside (no crop)</option>
                    </select>
                  </div>
                </div>
              )}

              {sel.kind === "photo" && (
                <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <ImageIcon className="w-3 h-3 mt-0.5 shrink-0" /> Uses each member's photo.
                </p>
              )}
              {sel.kind === "logo" && (
                <p className="text-[11px] text-muted-foreground">Uses the company logo from Settings → General Info.</p>
              )}

              {sel.kind === "qr" && (
                <div>
                  <label className={labelCls}>Encodes</label>
                  <select className={inputCls} value={sel.qrField} onChange={(e) => patchEl(sel.id, { qrField: e.target.value as any })}>
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sel.kind === "shape" && (
                <>
                  <ColorField label="Fill" value={sel.fill} swatches={swatches} onChange={(v) => patchEl(sel.id, { fill: v })} />
                  <Toggle
                    label={sel.fill2 ? "Gradient on" : "Add gradient"}
                    on={!!sel.fill2}
                    onChange={(on) => patchEl(sel.id, { fill2: on ? sel.fill2 || "#f59e0b" : "" })}
                  />
                  {sel.fill2 && (
                    <>
                      <ColorField label="Second colour" value={sel.fill2} swatches={swatches} onChange={(v) => patchEl(sel.id, { fill2: v })} />
                      <div>
                        <label className={labelCls}>Angle {sel.angle}°</label>
                        <input type="range" min={0} max={360} value={sel.angle} onChange={(e) => patchEl(sel.id, { angle: Number(e.target.value) })} className="w-full accent-[#024BAB]" />
                      </div>
                    </>
                  )}
                </>
              )}

              {hasShape && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Corners</label>
                    <select className={inputCls} value={sel.shape} onChange={(e) => patchEl(sel.id, { shape: e.target.value as any })}>
                      <option value="square">Square</option>
                      <option value="rounded">Rounded</option>
                      <option value="circle">Circle</option>
                    </select>
                  </div>
                  {sel.shape === "rounded" && (
                    <Num label="Rounding %" value={sel.radius} min={0} max={50} step={1} onChange={(v) => patchEl(sel.id, { radius: v })} />
                  )}
                </div>
              )}

              {hasBorder && (
                <div className="space-y-2">
                  <Num label="Border (mm, 0 = none)" value={sel.borderWidth} min={0} max={3} step={0.1} onChange={(v) => patchEl(sel.id, { borderWidth: Math.max(0, v) })} />
                  {sel.borderWidth > 0 && (
                    <ColorField label="Border colour" value={sel.borderColor} swatches={swatches} onChange={(v) => patchEl(sel.id, { borderColor: v })} />
                  )}
                </div>
              )}

              <div>
                <label className={labelCls}>Opacity {Math.round(sel.opacity * 100)}%</label>
                <input type="range" min={5} max={100} value={Math.round(sel.opacity * 100)} onChange={(e) => patchEl(sel.id, { opacity: Number(e.target.value) / 100 })} className="w-full accent-[#024BAB]" />
              </div>
            </>
          )}
        </div>
      </div>

      {showLibrary && (
        <IdCardLibrary company={company} employee={previewEmp} onPick={applyTemplate} onClose={() => setShowLibrary(false)} />
      )}
    </div>
  );
}
