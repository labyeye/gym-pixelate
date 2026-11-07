import { useEffect, useState } from "react";
import { REFUND_EVENT } from "@/lib/refundNotice";

/** Stays on screen until dismissed, so a customer who just paid can't miss that a refund is on its way. */
export default function RefundNotice() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => setMsg((e as CustomEvent<string>).detail);
    window.addEventListener(REFUND_EVENT, h);
    return () => window.removeEventListener(REFUND_EVENT, h);
  }, []);
  if (!msg) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="bg-white border-2 border-black shadow-[6px_6px_0px_#0a0a0a] max-w-md w-full p-6">
        <div className="w-12 h-12 rounded-full bg-amber-100 border-2 border-black flex items-center justify-center text-2xl mb-4">
          ₹
        </div>
        <h2 className="text-xl font-bold text-black mb-2">
          Payment received, refund on the way
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">{msg}</p>
        <button
          onClick={() => setMsg(null)}
          className="mt-5 w-full bg-[#024BAB] text-white border-2 border-black py-3 text-sm font-bold hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#0a0a0a] transition-all"
        >
          OK, understood
        </button>
      </div>
    </div>
  );
}
