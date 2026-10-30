import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarClock,
  Check,
  CreditCard,
  Crown,
  Infinity as Inf,
  Download,
  Loader2,
  Receipt,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { useAuth } from "@/contexts/AuthContext";
import {
  Btn,
  DataTable,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  Td,
  Tr,
  fmtDate,
  titleCase,
} from "@/components/gym/kit";
import { cn } from "@/lib/utils";
import { printSubscriptionBill } from "@/lib/subscriptionBill";
import { settingsAPI } from "@/services/api";

const CYCLES: { id: string; label: string; months: number; off: number }[] = [
  { id: "monthly", label: "Monthly", months: 1, off: 0 },
];
const rupees = (paise: number) =>
  "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const ORDER = ["starter", "growth", "pro"];

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

export default function SubscriptionPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { refreshTenant } = useAuth();
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState("");
  const { data: gymSettings } = useQuery({ queryKey: ["gym-settings"], queryFn: () => settingsAPI.get() });

  const { data: plansRes } = useQuery({
    queryKey: ["saas-plans"],
    queryFn: () => gym.billing.plans(),
  });
  const { data: subRes } = useQuery({
    queryKey: ["saas-sub"],
    queryFn: () => gym.billing.subscription(),
  });
  const { data: invRes } = useQuery({
    queryKey: ["saas-inv"],
    queryFn: () => request<any>("/billing/invoices"),
  });
  const { data: usage } = useQuery({
    queryKey: ["saas-usage"],
    queryFn: async () => {
      const [m, b, u] = await Promise.all([
        gym.members.list({ status: "active", limit: 1 }),
        request<any>("/branches"),
        gym.users.list({ status: "active" }),
      ]);
      return {
        members: m.total ?? 0,
        branches: b.count ?? (b.data || []).length,
        staff: (u.data || []).filter((x: any) => x.role !== "gym_owner").length,
      };
    },
  });

  const plans = plansRes?.data || {};
  const tenant = subRes?.data?.tenant;
  const sub = subRes?.data?.subscription;
  const current = tenant?.plan || "trial";
  const expires = tenant?.planExpiresAt ? new Date(tenant.planExpiresAt) : null;
  const daysLeft = expires
    ? Math.ceil((expires.getTime() - Date.now()) / 86400000)
    : null;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("payment") === "success") {
      notify.success("Payment successful", "Your plan is active.");
      refreshTenant();
      qc.invalidateQueries();
    }
    if (p.get("payment") === "failed")
      notify.error("Payment failed", p.get("reason") || "Please try again.");
  }, []);

  const pay = async (planKey: string) => {
    try {
      setBusy(planKey);
      if (!(await loadRazorpay()))
        throw new Error(
          "Could not load the payment window. Check your connection.",
        );
      const o = await gym.billing.razorpayOrder({
        plan: planKey,
        billingCycle: cycle,
      });
      const d = o.data;
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
              "Plan upgraded",
              `${titleCase(planKey)} is now active`,
            );
            await refreshTenant();
            qc.invalidateQueries();
          } catch (e: any) {
            notify.error("Verification failed", e.message);
          }
        },
      });
      rzp.open();
    } catch (e: any) {
      notify.error("Could not start payment", e.message);
    } finally {
      setBusy("");
    }
  };

  const cap = (plan: any, k: string) =>
    plan?.limits?.[k] == null ? null : plan.limits[k];
  const curPlan = plans[current];
  const meter = (label: string, used: number, max: number | null) => (
    <div>
      <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-1">
        <span>{label}</span>
        <span>
          {used}
          {max == null ? " / ∞" : ` / ${max}`}
        </span>
      </div>
      <div className="h-3 border-2 border-black bg-white">
        <div
          className={cn(
            "h-full",
            max != null && max > 1 && used / max > 0.9
              ? "bg-[#EF4444]"
              : "bg-[#00C48C]",
          )}
          style={{
            width: `${max == null ? 8 : Math.min(100, (used / Math.max(1, max)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );

  return (
    <AppLayout title="Subscription & Plan">
      <StatGrid>
        <StatCard
          label="Current plan"
          value={titleCase(current)}
          icon={Crown}
          color="#024BAB"
          sub={sub?.billingCycle ? titleCase(sub.billingCycle) : undefined}
        />
        <StatCard
          label={current === "trial" ? "Trial ends in" : "Renews in"}
          value={daysLeft == null ? "—" : `${Math.max(0, daysLeft)} days`}
          sub={expires ? fmtDate(expires) : undefined}
          icon={CalendarClock}
          color={daysLeft != null && daysLeft <= 5 ? "#EF4444" : "#00C48C"}
        />
        <StatCard
          label="Status"
          value={titleCase(sub?.status || tenant?.status || "active")}
          icon={BadgeCheck}
          color="#A855F7"
        />
        <StatCard
          label="Payments"
          value={(invRes?.data || []).length}
          icon={Receipt}
          color="#FA731C"
        />
      </StatGrid>

      {usage && (
        <Panel title="Plan usage" className="mb-5">
          <div className="grid sm:grid-cols-3 gap-5">
            {meter(
              "Active members",
              usage.members,
              cap(curPlan, "members") ?? (current === "trial" ? 100 : null),
            )}
            {meter(
              "Branches",
              usage.branches,
              cap(curPlan, "branches") ?? (current === "trial" ? 1 : null),
            )}
            {meter(
              "Staff accounts",
              usage.staff,
              cap(curPlan, "staff") ?? (current === "trial" ? 5 : null),
            )}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest">
          Choose a plan
        </h2>
        <div className="hidden">
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

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {ORDER.filter((k) => plans[k]).map((k) => {
          const p = plans[k];
          const months = CYCLES.find((c) => c.id === cycle)!.months;
          const total = p.prices?.[cycle];
          const isCurrent = current === k;
          return (
            <div
              key={k}
              className={cn(
                "nb-card nb-rise flex flex-col p-4",
                p.popular && "shadow-[6px_6px_0_#FA731C]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-black">{p.name}</h3>
                {p.popular && (
                  <span className="nb-badge nb-tag-orange">Popular</span>
                )}
              </div>
              <p className="text-xs font-bold text-black/60">
                {p.members == null && !p.custom
                  ? "Unlimited members"
                  : p.members
                    ? `Up to ${p.members} members`
                    : "Multi-branch chains"}
              </p>
              <div className="my-3">
                {total != null ? (
                  <>
                    <p className="text-3xl font-black tabular-nums">
                      {rupees(total / months)}
                      <span className="text-sm font-bold text-black/50">
                        {" "}
                        /mo
                      </span>
                    </p>
                    <p className="text-xs font-bold text-black/50">
                      {months > 1
                        ? `${rupees(total)} billed every ${months} months · excl. GST`
                        : "excl. GST"}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-black">Custom</p>
                )}
              </div>
              <ul className="space-y-1.5 text-xs font-bold flex-1">
                {p.features.map((f: string) => (
                  <li key={f} className="flex gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0 text-[#00A070] mt-px" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-2 text-[11px] font-black uppercase text-black/50">
                <span>
                  {p.limits?.branches == null ? (
                    <Inf className="inline w-3 h-3" />
                  ) : (
                    p.limits.branches
                  )}{" "}
                  branch{p.limits?.branches === 1 ? "" : "es"}
                </span>
                ·
                <span>
                  {p.limits?.staff == null ? "∞" : p.limits.staff} staff
                </span>
              </div>
              {p.custom ? (
                <a
                  className="nb-btn mt-3 px-4 py-2 text-sm text-center bg-white"
                  href="mailto:sales@pixelatenest.com?subject=NestGym%20Enterprise"
                >
                  Talk to sales
                </a>
              ) : (
                <Btn
                  className="mt-3"
                  color={isCurrent ? "#00A070" : "#024BAB"}
                  busy={busy === k}
                  onClick={() => pay(k)}
                >
                  {busy === k ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}{" "}
                  {isCurrent
                    ? "Renew"
                    : current === "trial"
                      ? "Choose plan"
                      : "Switch"}
                </Btn>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs font-bold text-black/50 mb-6">
        All plans start with a {plansRes?.data?.starter?.trialDays ?? 14}-day
        free trial. Prices are per gym per month, exclusive of 18% GST. Longer
        terms are billed upfront at a discount; limits count active members,
        branches and staff accounts.
      </p>

      <h3 className="text-xs font-black uppercase tracking-widest mb-2">
        Payment history
      </h3>
      <DataTable
        head={["Bill no", "Plan", "Term", "Amount", "Paid on", "Status", "Bill"]}
        empty={!(invRes?.data || []).length}
      >
        {(invRes?.data || []).map((v: any, i: number) => (
          <Tr key={v._id} i={i}>
            <Td className="font-black">{v.invoiceNumber}</Td>
            <Td className="font-bold">{titleCase(v.plan)}</Td>
            <Td className="capitalize">{titleCase(v.billingCycle)}</Td>
            <Td className="font-bold">
              ₹{Number(v.amount).toLocaleString("en-IN")}
            </Td>
            <Td className="text-xs font-bold">{fmtDate(v.paidAt)}</Td>
            <Td>
              <Pill value={v.status} />
            </Td>
            <Td>
              <button
                type="button"
                title="Download bill"
                aria-label="Download bill"
                className="p-1.5 border-2 border-transparent hover:border-black hover:bg-[#024BAB]/10 transition-colors"
                onClick={() => {
                  const g = gymSettings?.data || {};
                  printSubscriptionBill(v, {
                    name: g.companyName,
                    address: g.companyAddress,
                    gst: g.companyGST,
                    email: g.companyEmail,
                    phone: g.companyPhone,
                  });
                }}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </Td>
          </Tr>
        ))}
      </DataTable>
    </AppLayout>
  );
}
