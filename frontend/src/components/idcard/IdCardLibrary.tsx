import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { IdCardView } from "@/components/idcard/IdCardView";
import { buildQrMap } from "@/lib/idCardQr";
import { cardDims, qrValue, SAMPLE_EMPLOYEE, type IdCardTemplate, type IdCompany } from "@/lib/idCard";
import { DEFAULT_PALETTE, LIBRARY, PALETTES, type Palette } from "@/lib/idCardLibrary";
import { cn } from "@/lib/utils";

/**
 * Template library: every ready-made layout shown live (with your logo and company name) in the chosen colour theme.
 * Picking one loads it into the designer, and it can be undone there.
 */
export function IdCardLibrary({
  company,
  employee,
  onPick,
  onClose,
}: {
  company: IdCompany;
  employee: any;
  onPick: (t: IdCardTemplate) => void;
  onClose: () => void;
}) {
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [orientation, setOrientation] = useState<"all" | "portrait" | "landscape">("all");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const emp = employee || SAMPLE_EMPLOYEE;

  const items = useMemo(
    () =>
      LIBRARY.filter((l) => orientation === "all" || l.orientation === orientation).map((l) => ({
        ...l,
        template: l.build(palette),
      })),
    [palette, orientation],
  );

  useEffect(() => {
    const vals: string[] = [];
    for (const it of items)
      for (const el of it.template.front.elements)
        if (el.kind === "qr") vals.push(qrValue(el, emp, company));
    buildQrMap(vals).then(setQrMap);
  }, [items, emp, company]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="nb-modal border-2 border-black bg-white w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b-2 border-black shrink-0">
          <div>
            <h3 className="font-bold text-lg">Template library</h3>
            <p className="text-xs text-muted-foreground">
              Pick a layout and a colour theme. You can change everything afterwards, and undo this from the designer.
            </p>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b-2 border-black/10 flex flex-wrap items-center gap-x-6 gap-y-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Colour theme</span>
            {PALETTES.map((p) => (
              <button
                key={p.id}
                title={p.name}
                onClick={() => setPalette(p)}
                className={cn(
                  "flex h-7 w-12 overflow-hidden border-2",
                  palette.id === p.id ? "border-[#024BAB] ring-2 ring-[#024BAB]/40" : "border-black",
                )}
              >
                <span className="flex-1" style={{ background: p.primary }} />
                <span className="w-3" style={{ background: p.accent }} />
              </button>
            ))}
            <span className="text-xs font-bold">{palette.name}</span>
          </div>
          <div className="inline-flex border-2 border-black ml-auto">
            {(["all", "portrait", "landscape"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOrientation(o)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold border-r-2 border-black last:border-r-0 capitalize",
                  orientation === o ? "bg-[#024BAB] text-white" : "bg-white hover:bg-[#024BAB]/5",
                )}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 overflow-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 bg-[#F1F5F9]">
          {items.map((it) => {
            const { w, h } = cardDims(it.template);
            return (
              <button
                key={it.id}
                onClick={() => onPick(it.template)}
                className="group text-left border-2 border-black bg-white p-3 hover:shadow-[3px_3px_0_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
              >
                <FitPreview w={w} h={h}>
                  <IdCardView template={it.template} side="front" employee={emp} company={company} qrMap={qrMap} />
                </FitPreview>
                <p className="text-sm font-bold mt-2">{it.name}</p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {it.orientation} · front &amp; back
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/** Scales a real-size (mm) card down to fit the available width, never clipping it. */
function FitPreview({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const pw = w * 3.7795;
  const ph = h * 3.7795;
  const z = avail ? Math.min(1.35, (avail - 24) / pw) : 1;
  return (
    <div ref={ref} className="flex justify-center items-center bg-[#E5E7EB] py-3 overflow-hidden" style={{ height: ph * z + 24 }}>
      <div style={{ width: pw * z, height: ph * z }}>
        <div style={{ width: pw, height: ph, transform: `scale(${z})`, transformOrigin: "top left", boxShadow: "0 1px 5px rgba(0,0,0,.3)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
