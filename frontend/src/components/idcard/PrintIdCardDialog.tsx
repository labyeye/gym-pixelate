import { useEffect, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import { IdCardView } from "@/components/idcard/IdCardView";
import { loadIdCardSetup } from "@/lib/idCardData";
import { printIdCards } from "@/lib/printIdCards";
import { buildQrMap } from "@/lib/idCardQr";
import { qrValue, type IdCardTemplate, type IdCompany } from "@/lib/idCard";
import { cn } from "@/lib/utils";

/** "Print ID card(s)" for one or more members, using the design saved in Settings → Member ID card. */
export function PrintIdCardDialog({
  employees,
  onClose,
}: {
  employees: any[];
  onClose: () => void;
}) {
  const [setup, setSetup] = useState<{
    template: IdCardTemplate;
    company: IdCompany;
    saved: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [sides, setSides] = useState<"front" | "both">("both");
  const [layout, setLayout] = useState<"cards" | "sheet">("cards");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadIdCardSetup()
      .then(async (s) => {
        setSetup(s);
        if (!s.template.backEnabled) setSides("front");
        const first = employees[0];
        const vals = s.template.front.elements
          .filter((e) => e.kind === "qr")
          .map((e) => qrValue(e, first, s.company));
        setQrMap(await buildQrMap(vals));
      })
      .catch((e) => setError(e.message || "Could not load the ID card design"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const print = async () => {
    if (!setup) return;
    setBusy(true);
    const ok = await printIdCards({
      employees,
      template: setup.template,
      company: setup.company,
      sides,
      layout,
    });
    setBusy(false);
    if (!ok) setError("The print tab was blocked. Allow pop-ups for this site and try again.");
    else onClose();
  };

  const choice = (active: boolean) =>
    cn(
      "border-2 border-black px-3 py-2 text-sm font-bold text-left transition-colors",
      active ? "bg-[#024BAB] text-white" : "bg-white hover:bg-[#024BAB]/5",
    );

  const first = employees[0];
  const names = employees
    .slice(0, 3)
    .map((e) => e.name)
    .join(", ");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="nb-modal border-2 border-black bg-white w-full max-w-lg max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b-2 border-black">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#024BAB]" /> Print ID card
            {employees.length > 1 ? "s" : ""}
          </h3>
          <button onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!setup && !error && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-sm font-bold text-[#EF4444] border-2 border-[#EF4444] bg-[#EF4444]/10 p-3">
              {error}
            </p>
          )}

          {setup && (
            <>
              <p className="text-sm">
                <b>{employees.length}</b> member{employees.length > 1 ? "s" : ""}
                {names ? `: ${names}${employees.length > 3 ? "…" : ""}` : ""}
              </p>
              {!setup.saved && (
                <p className="text-xs text-muted-foreground border-2 border-black/20 p-2">
                  No design saved yet, so the default one is used. Customise it in{" "}
                  <b>Settings → ID Card Designer</b>.
                </p>
              )}

              {/* live preview of the first card */}
              <div className="flex justify-center bg-[#F1F5F9] border-2 border-black/10 p-4 overflow-hidden">
                <div style={{ zoom: 1.5 }}>
                  <div style={{ boxShadow: "0 1px 6px rgba(0,0,0,.25)" }}>
                    <IdCardView
                      template={setup.template}
                      side="front"
                      employee={first}
                      company={setup.company}
                      qrMap={qrMap}
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1.5">Sides</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className={choice(sides === "front")} onClick={() => setSides("front")}>
                    Front only
                  </button>
                  <button
                    className={cn(choice(sides === "both"), !setup.template.backEnabled && "opacity-40")}
                    disabled={!setup.template.backEnabled}
                    onClick={() => setSides("both")}
                    title={setup.template.backEnabled ? "" : "The design has no back side"}
                  >
                    Front &amp; back
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1.5">Layout</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className={choice(layout === "cards")} onClick={() => setLayout("cards")}>
                    Card printer
                    <span className="block text-[11px] font-normal opacity-80">One card per page</span>
                  </button>
                  <button className={choice(layout === "sheet")} onClick={() => setLayout("sheet")}>
                    A4 sheet
                    <span className="block text-[11px] font-normal opacity-80">
                      Several per page, with cut lines
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 p-5 pt-0">
          <button
            onClick={print}
            disabled={!setup || busy}
            className="flex-1 bg-[#024BAB] text-white border-2 border-black py-2.5 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Print
          </button>
          <button onClick={onClose} className="flex-1 border-2 border-black py-2.5 text-sm font-bold bg-white">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
