import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Apple,
  CalendarDays,
  CreditCard,
  Dumbbell,
  Home,
  LineChart,
  Loader2,
  LogOut,
  Megaphone,
  Plus,
} from "lucide-react";
import { request } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNotify } from "@/components/ui/Notification";
import {
  Btn,
  Modal,
  Panel,
  Pill,
  StatCard,
  TextInput,
  daysFromNow,
  fmtDate,
  fmtDateTime,
  inr,
  titleCase,
} from "@/components/gym/kit";
import { cn } from "@/lib/utils";

const get = (u: string) => request<any>(`/portal${u}`);
const post = (u: string, b: any = {}) =>
  request<any>(`/portal${u}`, { method: "POST", body: JSON.stringify(b) });

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

const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "pay", label: "Bills", icon: CreditCard },
  { id: "classes", label: "Classes", icon: CalendarDays },
  { id: "plans", label: "My plan", icon: Dumbbell },
  { id: "progress", label: "Progress", icon: LineChart },
];

export default function MemberPortal() {
  const { logout } = useAuth();
  const notify = useNotify();
  const qc = useQueryClient();
  const [tab, setTab] = useState("home");
  const [paying, setPaying] = useState("");
  const [log, setLog] = useState<any>(null);

  const ov = useQuery({ queryKey: ["p-ov"], queryFn: () => get("/overview") });
  const inv = useQuery({
    queryKey: ["p-inv"],
    queryFn: () => get("/invoices"),
    enabled: tab === "pay",
  });
  const att = useQuery({
    queryKey: ["p-att"],
    queryFn: () => get("/attendance"),
    enabled: tab === "home",
  });
  const ses = useQuery({
    queryKey: ["p-ses"],
    queryFn: () => get("/classes/sessions?days=7"),
    enabled: tab === "classes",
  });
  const mine = useQuery({
    queryKey: ["p-mine"],
    queryFn: () => get("/classes/mine"),
    enabled: tab === "classes",
  });
  const plans = useQuery({
    queryKey: ["p-plans"],
    queryFn: () => get("/plans"),
    enabled: tab === "plans" || tab === "progress",
  });
  const ann = useQuery({
    queryKey: ["p-ann"],
    queryFn: () => get("/announcements"),
    enabled: tab === "home",
  });

  const o = ov.data?.data;
  const refresh = () => qc.invalidateQueries();

  const payOnline = async (invoice: any) => {
    try {
      setPaying(invoice._id);
      if (!(await loadRazorpay()))
        throw new Error("Could not load the payment window.");
      const r = await post(`/invoices/${invoice._id}/pay`);
      const d = r.data;
      new (window as any).Razorpay({
        key: d.key,
        amount: d.amount,
        currency: d.currency,
        order_id: d.orderId,
        name: o?.gym?.name || "Gym",
        description: `Invoice ${d.invoiceNumber}`,
        prefill: { name: d.name, contact: d.phone, email: d.email },
        theme: { color: "#024BAB" },
        handler: async (res: any) => {
          try {
            await post(`/invoices/${invoice._id}/verify`, {
              razorpayOrderId: res.razorpay_order_id,
              razorpayPaymentId: res.razorpay_payment_id,
              razorpaySignature: res.razorpay_signature,
            });
            notify.success("Payment received", "Thank you!");
            refresh();
          } catch (e: any) {
            notify.error(
              "We could not confirm the payment",
              `${e.message}. If money was deducted, show this to the front desk.`,
            );
          }
        },
      }).open();
    } catch (e: any) {
      notify.error("Could not start payment", e.message);
    } finally {
      setPaying("");
    }
  };

  const book = async (s: any) => {
    try {
      const r = await post("/classes/book", {
        classId: s.classId,
        sessionDate: s.sessionDate,
      });
      notify.success(r.waitlisted ? "Added to waitlist" : "Booked!", s.name);
      refresh();
    } catch (e: any) {
      notify.error("Could not book", e.message);
    }
  };
  const cancel = async (id: string) => {
    try {
      await post(`/classes/bookings/${id}/cancel`);
      notify.success("Booking cancelled");
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  if (ov.isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#024BAB]" />
      </div>
    );
  if (ov.error)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-black">{(ov.error as any).message}</p>
        <Btn onClick={logout}>Sign out</Btn>
      </div>
    );

  const m = o.access.membership;
  const left = m ? daysFromNow(m.endDate) : null;
  const dueInvoices = (inv.data?.data || []).filter((i: any) =>
    ["pending", "partial"].includes(i.status),
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-20 border-b-2 border-black bg-[#024BAB] text-white px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-black truncate">{o.gym.name || "Your gym"}</p>
          <p className="text-xs font-bold text-white/80">
            {o.member.name} · {o.member.memberCode}
          </p>
        </div>
        <button
          onClick={logout}
          aria-label="Sign out"
          className="w-9 h-9 border-2 border-black bg-white text-black flex items-center justify-center"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {tab === "home" && (
          <>
            <div
              className={cn(
                "nb-rise border-2 border-black p-4",
                o.access.allowed ? "bg-[#00C48C]/20" : "bg-[#EF4444]/15",
              )}
            >
              <p className="text-[10px] font-black uppercase tracking-widest">
                Membership
              </p>
              <p className="text-xl font-black">
                {m?.planName || "No active plan"}
              </p>
              {m && (
                <p className="text-sm font-bold">
                  {fmtDate(m.startDate)} → {fmtDate(m.endDate)} ·{" "}
                  {left! < 0
                    ? `expired ${-left!} days ago`
                    : `${left} days left`}
                </p>
              )}
              {!o.access.allowed && (
                <p className="text-sm font-bold text-red-700 mt-1">
                  {o.access.reason}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(o.access.warnings || []).map((w: string) => (
                  <span key={w} className="nb-badge nb-tag-orange">
                    {w}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="To pay"
                value={inr(o.due)}
                icon={CreditCard}
                color={o.due > 0 ? "#EF4444" : "#14B8A6"}
                onClick={() => setTab("pay")}
              />
              <StatCard
                label="Visits (30 days)"
                value={o.visits30}
                icon={Dumbbell}
                color="#A855F7"
              />
            </div>
            {o.trainers.length > 0 && (
              <Panel title="Your trainer">
                {o.trainers.map((t: any) => (
                  <p key={t._id} className="font-bold">
                    {t.trainerId?.name}{" "}
                    <span className="text-black/50 text-xs">
                      {t.trainerId?.phone}
                    </span>
                  </p>
                ))}
              </Panel>
            )}
            {o.pt.length > 0 && (
              <Panel title="Personal training">
                {o.pt.map((p: any) => {
                  const used = p.sessions.filter((s: any) =>
                    ["completed", "missed"].includes(s.status),
                  ).length;
                  const next = p.sessions
                    .filter((s: any) => s.status === "scheduled")
                    .sort(
                      (a: any, b: any) =>
                        +new Date(a.scheduledAt) - +new Date(b.scheduledAt),
                    )[0];
                  return (
                    <p key={p._id} className="text-sm font-bold">
                      {p.name}: {p.totalSessions - used} of {p.totalSessions}{" "}
                      sessions left
                      {next ? ` · next ${fmtDateTime(next.scheduledAt)}` : ""}
                    </p>
                  );
                })}
              </Panel>
            )}
            {o.locker && (
              <Panel title="Locker">
                <p className="font-bold">
                  #{o.locker.number} · till {fmtDate(o.locker.validTill)}
                </p>
              </Panel>
            )}
            <Panel
              title="Announcements"
              right={<Megaphone className="w-4 h-4" />}
            >
              {(ann.data?.data || []).length === 0 ? (
                <p className="text-xs font-bold uppercase text-black/40">
                  Nothing new
                </p>
              ) : (
                <ul className="space-y-2">
                  {ann.data.data.slice(0, 4).map((a: any) => (
                    <li
                      key={a._id}
                      className="border-l-4 border-[#FA731C] pl-2"
                    >
                      <p className="font-black text-sm">
                        {a.pinned && "📌 "}
                        {a.title}
                      </p>
                      <p className="text-xs text-black/60">{a.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Recent visits">
              {(att.data?.data || []).length === 0 ? (
                <p className="text-xs font-bold uppercase text-black/40">
                  No visits yet
                </p>
              ) : (
                <ul className="divide-y divide-black/10 text-sm">
                  {att.data.data.slice(0, 6).map((a: any) => (
                    <li key={a._id} className="py-1.5 flex justify-between">
                      <span className="font-bold">
                        {fmtDateTime(a.checkinAt)}
                      </span>
                      <span className="text-black/50">
                        {a.durationMin ? `${a.durationMin} min` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {o.gym.phone && (
              <p className="text-center text-xs font-bold text-black/50">
                Need help? Call {o.gym.phone}
              </p>
            )}
          </>
        )}

        {tab === "pay" && (
          <>
            {(inv.data?.data || []).length === 0 && !inv.isLoading && (
              <p className="text-center font-black uppercase text-black/30 py-10">
                No bills yet
              </p>
            )}
            {(inv.data?.data || []).map((i: any) => (
              <div key={i._id} className="nb-card nb-rise p-4">
                <div className="flex justify-between gap-2">
                  <p className="font-black">{i.invoiceNumber}</p>
                  <Pill value={i.status} />
                </div>
                <p className="text-xs font-bold text-black/50">
                  {fmtDate(i.issuedAt)} · {i.items?.[0]?.description}
                </p>
                <div className="flex justify-between items-end mt-2">
                  <div>
                    <p className="text-xs font-bold text-black/50">
                      Total {inr(i.totalAmount, 2)} · paid{" "}
                      {inr(i.paidAmount, 2)}
                    </p>
                    {i.balance > 0 && (
                      <p className="text-lg font-black text-red-600">
                        Due {inr(i.balance, 2)}
                      </p>
                    )}
                  </div>
                  {["pending", "partial"].includes(i.status) &&
                    (o.gym.onlinePayments ? (
                      <Btn
                        color="#00A070"
                        busy={paying === i._id}
                        onClick={() => payOnline(i)}
                      >
                        <CreditCard className="w-4 h-4" /> Pay online
                      </Btn>
                    ) : (
                      <span className="text-xs font-black uppercase text-black/40">
                        Pay at desk
                      </span>
                    ))}
                </div>
              </div>
            ))}
            {dueInvoices.length > 0 && !o.gym.onlinePayments && (
              <p className="text-xs font-bold text-black/50 text-center">
                Online payment isn't enabled at your gym yet.
              </p>
            )}
          </>
        )}

        {tab === "classes" && (
          <>
            <Panel title="My bookings">
              {(mine.data?.data || []).length === 0 ? (
                <p className="text-xs font-bold uppercase text-black/40">
                  No upcoming bookings
                </p>
              ) : (
                <ul className="divide-y divide-black/10">
                  {mine.data.data.map((b: any) => (
                    <li
                      key={b._id}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-black">{b.classId?.name}</p>
                        <p className="text-xs font-bold text-black/50">
                          {fmtDateTime(b.sessionDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill value={b.status} />
                        <Btn
                          light
                          className="!py-1 !px-2 text-xs"
                          onClick={() => cancel(b._id)}
                        >
                          Cancel
                        </Btn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <h3 className="text-xs font-black uppercase tracking-widest">
              This week
            </h3>
            {(ses.data?.data || []).map((s: any) => (
              <div
                key={s.classId + s.sessionDate}
                className="nb-card nb-rise p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-black truncate">{s.name}</p>
                  <p className="text-xs font-bold text-black/50">
                    {fmtDateTime(s.sessionDate)} · {s.durationMin} min
                    {s.trainer ? ` · ${s.trainer}` : ""}
                  </p>
                  <p className="text-[10px] font-black uppercase text-black/40">
                    {s.seatsLeft} seats left
                  </p>
                </div>
                <Btn
                  className="!py-1.5 !px-3 text-xs"
                  color={s.seatsLeft ? "#024BAB" : "#FA731C"}
                  onClick={() => book(s)}
                >
                  {s.seatsLeft ? "Book" : "Waitlist"}
                </Btn>
              </div>
            ))}
            {!ses.isLoading && (ses.data?.data || []).length === 0 && (
              <p className="text-center font-black uppercase text-black/30 py-8">
                No classes scheduled
              </p>
            )}
          </>
        )}

        {tab === "plans" && (
          <>
            {plans.data?.data?.workout ? (
              <Panel title={`Workout — ${plans.data.data.workout.name}`}>
                <p className="text-xs font-bold text-black/50 mb-2">
                  {titleCase(plans.data.data.workout.goal)} ·{" "}
                  {plans.data.data.workout.weeks} weeks
                  {plans.data.data.workout.trainerId
                    ? ` · by ${plans.data.data.workout.trainerId.name}`
                    : ""}
                </p>
                {plans.data.data.workout.days.map((d: any) => (
                  <div key={d.label} className="mb-3">
                    <p className="font-black">
                      {d.label}{" "}
                      <span className="text-black/50 text-xs">{d.focus}</span>
                    </p>
                    <ul className="text-sm">
                      {d.exercises.map((e: any, i: number) => (
                        <li
                          key={i}
                          className="flex justify-between border-b border-black/10 py-1"
                        >
                          <span className="font-bold">{e.name}</span>
                          <span className="text-black/60">
                            {e.sets} × {e.reps}
                            {e.weightKg ? ` @ ${e.weightKg} kg` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Panel>
            ) : (
              <Panel title="Workout">
                <p className="text-xs font-bold uppercase text-black/40">
                  Your trainer hasn't assigned a plan yet
                </p>
              </Panel>
            )}
            {plans.data?.data?.diet ? (
              <Panel title={`Diet — ${plans.data.data.diet.name}`}>
                <p className="text-xs font-bold text-black/50 mb-2">
                  {plans.data.data.diet.targetCalories ?? "—"} kcal ·{" "}
                  {plans.data.data.diet.targetProteinG ?? "—"} g protein ·{" "}
                  {plans.data.data.diet.waterLitres} L water
                </p>
                <ul className="text-sm">
                  {plans.data.data.diet.meals.map((x: any, i: number) => (
                    <li key={i} className="border-b border-black/10 py-1">
                      <b>{titleCase(x.slot)}</b> — {x.items}
                    </li>
                  ))}
                </ul>
                {plans.data.data.diet.avoid && (
                  <p className="text-xs font-bold mt-2 text-red-700">
                    Avoid: {plans.data.data.diet.avoid}
                  </p>
                )}
              </Panel>
            ) : (
              <Panel title="Diet" right={<Apple className="w-4 h-4" />}>
                <p className="text-xs font-bold uppercase text-black/40">
                  No diet plan yet
                </p>
              </Panel>
            )}
          </>
        )}

        {tab === "progress" && (
          <>
            <div className="flex justify-end">
              <Btn
                onClick={() =>
                  setLog({
                    weightKg: "",
                    bodyFatPct: "",
                    waistCm: "",
                    notes: "",
                  })
                }
              >
                <Plus className="w-4 h-4" /> Log today
              </Btn>
            </div>
            {(plans.data?.data?.measurements || []).length === 0 ? (
              <p className="text-center font-black uppercase text-black/30 py-8">
                No check-ins yet — log your weight to start tracking
              </p>
            ) : (
              <div className="space-y-2">
                {plans.data.data.measurements.map((x: any) => (
                  <div
                    key={x._id}
                    className="nb-card p-3 flex justify-between text-sm"
                  >
                    <span className="font-black">{fmtDate(x.measuredAt)}</span>
                    <span className="font-bold">
                      {x.weightKg ? `${x.weightKg} kg` : ""}{" "}
                      {x.bmi ? `· BMI ${x.bmi}` : ""}{" "}
                      {x.bodyFatPct ? `· ${x.bodyFatPct}% fat` : ""}{" "}
                      {x.waistCm ? `· waist ${x.waistCm}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t-2 border-black bg-white grid grid-cols-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10px] font-black uppercase tracking-wider border-r border-black/10 last:border-0",
              tab === t.id ? "bg-[#FA731C] text-white" : "",
            )}
          >
            <t.icon className="w-5 h-5" />
            {t.label}
          </button>
        ))}
      </nav>

      <Modal
        open={!!log}
        title="Log a check-in"
        onClose={() => setLog(null)}
        footer={
          <>
            <Btn light onClick={() => setLog(null)}>
              Cancel
            </Btn>
            <Btn
              onClick={async () => {
                try {
                  await post("/measurements", log);
                  notify.success("Saved");
                  setLog(null);
                  refresh();
                } catch (e: any) {
                  notify.error("Could not save", e.message);
                }
              }}
            >
              Save
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Weight (kg)"
            type="number"
            step="0.1"
            value={log?.weightKg ?? ""}
            onChange={(e: any) => setLog({ ...log, weightKg: e.target.value })}
          />
          <TextInput
            label="Body fat (%)"
            type="number"
            step="0.1"
            value={log?.bodyFatPct ?? ""}
            onChange={(e: any) =>
              setLog({ ...log, bodyFatPct: e.target.value })
            }
          />
          <TextInput
            label="Waist (cm)"
            type="number"
            value={log?.waistCm ?? ""}
            onChange={(e: any) => setLog({ ...log, waistCm: e.target.value })}
          />
          <TextInput
            label="Note"
            value={log?.notes ?? ""}
            onChange={(e: any) => setLog({ ...log, notes: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
