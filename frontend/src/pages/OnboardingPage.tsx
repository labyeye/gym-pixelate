import { PhoneInput } from "@/components/ui/PhoneInput";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Dumbbell,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/services/api";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { titleCase } from "@/components/gym/kit";
import { cn } from "@/lib/utils";

type Step = "gym" | "plan" | "payment";
const STEPS: { id: Step; label: string }[] = [
  { id: "gym", label: "Gym" },
  { id: "plan", label: "Plan" },
  { id: "payment", label: "Payment" },
];
const CYCLES = [
  { id: "monthly", label: "Monthly", months: 1, off: 0 },
  { id: "quarterly", label: "Quarterly", months: 3, off: 10 },
  { id: "half_yearly", label: "6 months", months: 6, off: 20 },
  { id: "yearly", label: "Yearly", months: 12, off: 30 },
];
const ORDER = ["starter", "growth", "pro", "elite"];
const rupees = (paise: number) =>
  "₹" + Math.round(paise / 100).toLocaleString("en-IN");

const field =
  "w-full px-3 py-2.5 text-sm font-medium bg-white border-2 border-black focus:outline-none focus:ring-2 focus:ring-[#024BAB] focus:ring-offset-2";
const lbl = "block text-xs font-bold uppercase tracking-wider text-black mb-2";
const cta =
  "w-full bg-[#024BAB] text-white border-2 border-black font-bold uppercase text-sm px-4 py-3 flex items-center justify-center gap-2 hover:bg-[#023590] disabled:opacity-60 disabled:cursor-not-allowed transition-all";

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

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center justify-center mb-10">
      {STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-9 h-9 border-2 border-black flex items-center justify-center font-bold text-sm",
                  done && "bg-[#024BAB] text-white",
                  active && "bg-[#FA731C] text-white",
                  !done && !active && "bg-white text-gray-400",
                )}
              >
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase mt-1 tracking-wide",
                  active
                    ? "text-[#FA731C]"
                    : done
                      ? "text-[#024BAB]"
                      : "text-gray-400",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-16 h-0.5 mt-[-14px] mx-1",
                  i < idx ? "bg-[#024BAB]" : "bg-gray-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Same wizard as Nest HR: details -> plan -> Razorpay payment -> /welcome.
export default function OnboardingPage() {
  const { user, tenant, logout, refreshTenant } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const [step, setStep] = useState<Step>("gym");
  const [form, setForm] = useState({
    name: "",
    email: user?.email || "",
    phone: user?.phone || "",
    address: "",
    gst: "",
    pan: "",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cycle, setCycle] = useState("yearly");
  const [planKey, setPlanKey] = useState("growth");
  const [paying, setPaying] = useState(false);

  const { data: plansRes } = useQuery({
    queryKey: ["saas-plans"],
    queryFn: () => gym.billing.plans(),
  });
  const plans = plansRes?.data || {};

  // Already-onboarded owners have no business here, but not while we are finishing (we go to /welcome).
  const finishing = useRef(false);
  useEffect(() => {
    if (tenant?.onboarded && !finishing.current)
      navigate("/", { replace: true });
  }, [tenant?.onboarded, navigate]);

  const months = CYCLES.find((c) => c.id === cycle)!.months;
  const plan = plans[planKey];
  const total: number | undefined = plan?.prices?.[cycle];

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await authAPI.onboarding(form);
      setStep("plan");
    } catch (err: any) {
      setFormError(err.message || "Could not save your details.");
    } finally {
      setSaving(false);
    }
  };

  const finish = async (to: string) => {
    finishing.current = true;
    await authAPI.onboarding({ complete: true });
    await refreshTenant();
    navigate(to, { replace: true });
  };

  const startTrial = async () => {
    try {
      await finish("/welcome");
    } catch (e: any) {
      finishing.current = false;
      notify.error("Could not start trial", e.message);
    }
  };

  const pay = async () => {
    setPaying(true);
    try {
      if (!(await loadRazorpay()))
        throw new Error(
          "Could not load the payment window. Check your connection.",
        );
      const o = await gym.billing.razorpayOrder({
        plan: planKey,
        billingCycle: cycle,
      });
      const d = o.data;
      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: d.key,
          amount: d.amount,
          currency: d.currency,
          order_id: d.orderId,
          name: "NestGym",
          description: `${titleCase(planKey)} · ${CYCLES.find((c) => c.id === cycle)?.label}`,
          prefill: {
            name: d.customerName,
            email: d.customerEmail,
            contact: d.customerPhone,
          },
          theme: { color: "#024BAB" },
          handler: async (r: any) => {
            try {
              await gym.billing.razorpayVerify({
                razorpayOrderId: r.razorpay_order_id,
                razorpayPaymentId: r.razorpay_payment_id,
                razorpaySignature: r.razorpay_signature,
              });
              notify.success(
                "Payment successful",
                "Your plan is active. Welcome to NestGym!",
              );
              await finish("/welcome");
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e.message !== "Payment cancelled")
        notify.error(
          "Could not complete payment",
          e.message || "Please try again.",
        );
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F6FF]">
      <header className="bg-white border-b-2 border-black sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#024BAB] border-2 border-black flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl text-black">
              NestGym
            </span>
          </div>
          <button
            onClick={logout}
            className="text-sm font-bold text-black hover:text-[#024BAB] transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <StepIndicator current={step} />

        {step === "gym" && (
          <div>
            <div className="text-center mb-8">
              <h1 className="font-display font-bold text-3xl text-black mb-2">
                Set up your gym
              </h1>
              <p className="text-gray-500 font-medium text-sm">
                Your business and contact details. These appear on member
                invoices.
              </p>
            </div>
            <form
              onSubmit={saveDetails}
              className="bg-white border-2 border-black p-8 max-w-2xl mx-auto space-y-5"
            >
              {formError && (
                <div className="flex items-start gap-3 bg-white border-2 border-[#EF4444] px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
                  <span className="text-sm font-medium text-[#EF4444]">
                    {formError}
                  </span>
                </div>
              )}
              <div>
                <label className={lbl}>Gym name *</label>
                <input
                  className={field}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Iron Paradise Fitness"
                  required
                  autoFocus
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Gym email</label>
                  <input
                    type="email"
                    className={field}
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="gym@example.com"
                  />
                </div>
                <div>
                  <label className={lbl}>Phone *</label>
                  <PhoneInput
                    inputClassName={field}
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className={lbl}>Address</label>
                <input
                  className={field}
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  placeholder="Street, area, city"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>GST number</label>
                  <input
                    className={field}
                    value={form.gst}
                    onChange={(e) =>
                      setForm({ ...form, gst: e.target.value.toUpperCase() })
                    }
                    placeholder="27AABCT1234A1Z5"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className={lbl}>PAN number</label>
                  <input
                    className={field}
                    value={form.pan}
                    onChange={(e) =>
                      setForm({ ...form, pan: e.target.value.toUpperCase() })
                    }
                    placeholder="AAAAA0000A"
                    maxLength={10}
                  />
                </div>
              </div>
              <button type="submit" disabled={saving} className={cta}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Continue to Plans
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="text-xs text-gray-600 text-center font-medium">
                * Required fields
              </p>
            </form>
          </div>
        )}

        {step === "plan" && (
          <div>
            <div className="text-center mb-8">
              <h1 className="font-display font-bold text-3xl text-black mb-2">
                Choose your plan
              </h1>
              <p className="text-gray-500 font-medium text-sm">
                Longer terms cost less per month. Prices exclude GST.
              </p>
            </div>
            <div className="flex justify-center mb-6">
              <div className="flex border-2 border-black bg-white">
                {CYCLES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCycle(c.id)}
                    className={cn(
                      "px-3 py-2 text-[11px] font-black uppercase tracking-widest border-r-2 border-black last:border-r-0",
                      cycle === c.id
                        ? "bg-[#FA731C] text-white"
                        : "hover:bg-[#024BAB]/10",
                    )}
                  >
                    {c.label}
                    {c.off ? (
                      <span className="ml-1 opacity-80">−{c.off}%</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {ORDER.filter((k) => plans[k]).map((k) => {
                const p = plans[k];
                const selected = planKey === k;
                const t = p.prices?.[cycle];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPlanKey(k)}
                    className={cn(
                      "text-left border-2 bg-white p-5 flex flex-col",
                      selected
                        ? "border-[#024BAB] ring-2 ring-[#024BAB]"
                        : "border-black opacity-70 hover:opacity-100",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-display font-bold text-lg text-black">
                        {p.name}
                      </h3>
                      {selected ? (
                        <Check className="w-5 h-5 text-[#024BAB] shrink-0" />
                      ) : p.popular ? (
                        <span className="text-[10px] font-bold uppercase text-[#FA731C]">
                          Popular
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs font-bold text-gray-500 mb-2">
                      {p.members == null
                        ? "Unlimited members"
                        : `Up to ${p.members} members`}
                    </p>
                    {t != null && (
                      <div className="font-display font-bold text-2xl text-[#024BAB]">
                        {rupees(t / months)}
                        <span className="text-xs text-gray-500 font-medium">
                          {" "}
                          /mo
                        </span>
                      </div>
                    )}
                    {t != null && months > 1 && (
                      <div className="text-[11px] text-gray-500 font-medium">
                        {rupees(t)} every {months} months
                      </div>
                    )}
                    <ul className="mt-3 space-y-1">
                      {(p.features || []).slice(0, 4).map((f: string) => (
                        <li
                          key={f}
                          className="flex items-start gap-1.5 text-[11px] text-gray-700 font-medium"
                        >
                          <Check className="w-3 h-3 text-[#024BAB] shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-gray-500 font-medium mb-8">
              Running a chain of 10+ branches?{" "}
              <a
                href="mailto:support@pixelatenest.com"
                className="font-bold text-[#024BAB] hover:underline"
              >
                Contact sales
              </a>
            </p>
            <div className="max-w-sm mx-auto">
              <button
                onClick={() => setStep("payment")}
                disabled={!plan}
                className={cta}
              >
                Continue to Payment
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStep("gym")}
                className="w-full text-center text-xs text-gray-400 hover:text-black font-bold mt-3 transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {step === "payment" && (
          <div>
            <div className="text-center mb-8">
              <h1 className="font-display font-bold text-3xl text-black mb-2">
                Confirm &amp; Pay
              </h1>
              <p className="text-gray-500 font-medium text-sm">
                A secure Razorpay checkout will open to complete your payment
              </p>
            </div>
            <div className="max-w-md mx-auto space-y-4">
              <div className="bg-white border-2 border-black">
                <div className="p-5 border-b-2 border-black bg-[#F0F6FF]">
                  <p className="font-bold text-xs uppercase text-gray-500">
                    Order Summary
                  </p>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  <Row k="Plan" v={`NestGym ${titleCase(planKey)}`} />
                  <Row
                    k="Members"
                    v={
                      plan?.members == null
                        ? "Unlimited"
                        : `Up to ${plan.members}`
                    }
                  />
                  <Row
                    k="Term"
                    v={CYCLES.find((c) => c.id === cycle)?.label || ""}
                  />
                  {total != null && (
                    <Row k="Per month" v={rupees(total / months)} muted />
                  )}
                  <div className="border-t-2 border-black pt-3 flex justify-between items-center">
                    <span className="font-bold text-sm uppercase">
                      Total (excl. GST)
                    </span>
                    <span className="font-bold text-xl text-[#024BAB]">
                      {total != null ? rupees(total) : "—"}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={pay}
                disabled={paying || total == null}
                className={cn(cta, "py-4")}
              >
                {paying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Opening checkout...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-5 h-5" />
                    Pay {total != null ? rupees(total) : ""} via Razorpay
                  </>
                )}
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                Secured by Razorpay · PCI-DSS compliant
              </div>
              <button
                onClick={() => setStep("plan")}
                className="w-full text-center text-xs text-gray-400 hover:text-black font-bold transition-colors"
              >
                ← Back to plan selection
              </button>
              <button
                onClick={startTrial}
                disabled={paying}
                className="w-full text-center text-xs text-[#024BAB] hover:underline font-bold"
              >
                Not ready? Start the free trial instead
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="font-bold text-gray-600">{k}</span>
      <span className={cn("font-bold", muted ? "text-gray-500" : "text-black")}>
        {v}
      </span>
    </div>
  );
}
