import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Dumbbell, Loader2, XCircle } from "lucide-react";
import { request } from "@/services/api";
import { fmtDate, inr } from "@/components/gym/kit";

// Public page behind the WhatsApp payment link: no login, the token in the URL is the credential.
const get = (t: string, p = "") => request<any>(`/pay/${encodeURIComponent(t)}${p}`);
const post = (t: string, p: string, b: any = {}) => request<any>(`/pay/${encodeURIComponent(t)}${p}`, { method: "POST", body: JSON.stringify(b) });

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function PayPage() {
  const { token = "" } = useParams();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);

  const load = () => get(token).then((r) => setD(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const pay = async () => {
    setErr("");
    try {
      setBusy(true);
      if (!(await loadRazorpay())) throw new Error("Could not load the payment window. Check your connection.");
      const o = (await post(token, "/order")).data;
      new (window as any).Razorpay({
        key: o.key, amount: o.amount, currency: o.currency, order_id: o.orderId, name: d.gymName, description: `Invoice ${o.invoiceNumber}`,
        prefill: { name: o.name, contact: o.phone, email: o.email }, theme: { color: "#024BAB" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: any) => {
          try {
            const v = await post(token, "/verify", { razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature });
            setDone(v.data);
            load();
          } catch (e: any) {
            setErr(`${e.message}. If money was deducted, show this screen to the front desk.`);
          } finally {
            setBusy(false);
          }
        },
      }).open();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-sm border-2 border-black bg-white nb-shadow p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#024BAB] border-2 border-black flex items-center justify-center"><Dumbbell className="w-5 h-5 text-white" /></div>
          <span className="font-display font-bold text-xl">{d?.gymName || "NestGym"}</span>
        </div>
        {children}
      </div>
    </div>
  );

  if (!d && !err) return shell(<div className="flex justify-center py-8"><Loader2 className="w-7 h-7 animate-spin text-[#024BAB]" /></div>);
  if (!d) return shell(<div className="text-center"><XCircle className="w-10 h-10 mx-auto text-[#EF4444]" /><p className="font-black mt-2">{err}</p></div>);

  const settled = done?.status === "paid" || d.status === "paid" || d.status === "settled";
  return shell(
    <>
      <p className="text-[10px] font-black uppercase tracking-widest text-black/50">Fee payment</p>
      <p className="font-black text-lg">{d.memberName}</p>
      <p className="text-xs font-bold text-black/50 mb-4">Invoice {d.invoiceNumber}{d.description ? ` · ${d.description}` : ""}</p>

      {settled ? (
        <div className="border-2 border-black bg-[#00C48C]/20 p-4 text-center">
          <CheckCircle2 className="w-9 h-9 mx-auto text-[#00A070]" />
          <p className="font-black mt-1">{d.status === "settled" ? "Nothing is due" : "Payment received"}</p>
          <p className="text-xs font-bold">{d.paidAt ? `Paid on ${fmtDate(d.paidAt)}. ` : ""}Thank you!</p>
        </div>
      ) : d.status === "expired" ? (
        <div className="border-2 border-black bg-[#EF4444]/10 p-4 text-center">
          <p className="font-black">This payment link has expired</p>
          <p className="text-xs font-bold">Please ask {d.gymName} for a new one.</p>
        </div>
      ) : (
        <>
          <div className="border-2 border-black bg-[#024BAB]/5 p-4 mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest">Amount due</p>
            <p className="text-3xl font-black">{inr(d.amount, 2)}</p>
            <p className="text-xs font-bold text-black/50">Link valid till {fmtDate(d.expiresAt)}</p>
          </div>
          {err && <p className="border-2 border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444] text-sm font-bold p-2 mb-3">{err}</p>}
          <button onClick={pay} disabled={busy} className="nb-btn w-full bg-[#00A070] text-white py-3 font-black uppercase flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Pay {inr(d.amount, 2)}
          </button>
          <p className="text-[11px] font-bold text-black/40 text-center mt-3">UPI · cards · netbanking. Payments go straight to {d.gymName}.</p>
        </>
      )}
    </>,
  );
}
