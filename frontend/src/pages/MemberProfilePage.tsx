import { waDigits } from "@/lib/countries";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Camera,
  CalendarCheck,
  CreditCard,
  LogIn,
  Loader2,
  MessageCircle,
  Printer,
  Repeat,
  ShoppingBag,
  Snowflake,
  TrendingUp,
  Undo2,
  UserRound,
  Wallet,
  ArrowUpCircle,
  ArrowRightLeft,
  Sun,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import {
  ActionButton,
  Btn,
  DataTable,
  Panel,
  Pill,
  RowActions,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  Tr,
  daysFromNow,
  fmtDate,
  fmtDateTime,
  inr,
  titleCase,
} from "@/components/gym/kit";
import { SellMembershipModal } from "@/components/gym/SellMembershipModal";
import {
  MembershipActionModal,
  PaymentModal,
  type MsAction,
} from "@/components/gym/ActionModals";
import { printInvoice } from "@/components/gym/printInvoice";
import { Modal as PModal } from "@/components/gym/kit";
import { KeyRound } from "lucide-react";
import AutopayButton from "@/components/gym/AutopayButton";
import WalletPanel from "@/components/gym/WalletPanel";
import PrivacyPanel from "@/components/gym/PrivacyPanel";

function Spark({
  points,
  color = "#024BAB",
}: {
  points: number[];
  color?: string;
}) {
  if (points.length < 2)
    return (
      <p className="text-xs font-bold text-black/40 uppercase">
        Log 2+ weigh-ins to see a trend
      </p>
    );
  const w = 260,
    h = 70,
    min = Math.min(...points),
    max = Math.max(...points),
    span = max - min || 1;
  const xy = points
    .map(
      (p, i) =>
        `${(i / (points.length - 1)) * w},${h - 6 - ((p - min) / span) * (h - 12)}`,
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <polyline points={xy} fill="none" stroke={color} strokeWidth="3" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={(i / (points.length - 1)) * w}
          cy={h - 6 - ((p - min) / span) * (h - 12)}
          r="3.5"
          fill={color}
          stroke="#0a0a0a"
        />
      ))}
    </svg>
  );
}

export default function MemberProfilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const qc = useQueryClient();
  const [tab, setTab] = useState("plans");
  const [sell, setSell] = useState<{
    mode: "sell" | "renew" | "upgrade";
    membership?: any;
  } | null>(null);
  const [act, setAct] = useState<{ m: any; a: MsAction } | null>(null);
  const [pay, setPay] = useState<{ inv: any; mode: "pay" | "refund" } | null>(
    null,
  );
  const [portal, setPortal] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["member-overview", id],
    queryFn: () => gym.members.overview(id),
  });
  const o = data?.data;
  if (isLoading || !o)
    return (
      <AppLayout title="Member">
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#024BAB]" />
        </div>
      </AppLayout>
    );

  const {
    member,
    memberships,
    invoices,
    measurements,
    pt,
    workout,
    diet,
    trainers,
    locker,
  } = o;
  // the plan running right now (active, or frozen but not yet over)
  const current = memberships.find(
    (m: any) =>
      ["active", "frozen"].includes(m.status) && new Date(m.endDate) >= new Date(),
  );
  const left = current ? daysFromNow(current.endDate) : null;
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["member-overview", id] });
  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      qc.invalidateQueries();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  const weights = [...measurements]
    .reverse()
    .map((m: any) => m.weightKg)
    .filter(Boolean);
  const live = ["active", "frozen", "upcoming"];

  return (
    <AppLayout title="Member Profile">
      <button
        onClick={() => navigate("/members")}
        className="flex items-center gap-1.5 text-sm font-bold mb-4 hover:text-[#024BAB]"
      >
        <ArrowLeft className="w-4 h-4" /> Members
      </button>

      <div className="nb-card nb-rise p-4 sm:p-5 mb-5 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 border-2 border-black bg-[#024BAB] text-white flex items-center justify-center text-2xl font-black shrink-0 overflow-hidden nb-shadow-sm">
            {member.photo ? (
              <img
                src={member.photo}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              member.name[0]?.toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black truncate">{member.name}</h2>
            <p className="text-xs font-bold text-black/50">
              {member.memberCode} · {member.phone}
              {member.email ? ` · ${member.email}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <Pill value={member.status} />
              {(member.health?.conditions || []).map((c: string) => (
                <span key={c} className="nb-badge nb-tag-red">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setSell({ mode: "sell" })}>
            <ShoppingBag className="w-4 h-4" />{" "}
            {current ? "New plan" : "Sell plan"}
          </Btn>
          <Btn
            color="#0D9488"
            onClick={async () => {
              try {
                const r = await gym.members.portalAccess(member._id);
                setPortal(r.data);
                refresh();
              } catch (e: any) {
                notify.error("Could not create login", e.message);
              }
            }}
          >
            <KeyRound className="w-4 h-4" />{" "}
            {member.userId ? "Reset portal login" : "Portal login"}
          </Btn>
          {current && <AutopayButton member={member} membership={current} />}
          <Btn
            light
            onClick={() =>
              window.open(`https://wa.me/${waDigits(member.phone)}`, "_blank")
            }
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Btn>
        </div>
      </div>

      <StatGrid>
        <StatCard
          label="Plan"
          value={current?.planName || "None"}
          sub={
            current
              ? `${fmtDate(current.startDate)} → ${fmtDate(current.endDate)}`
              : "No active plan"
          }
          icon={CalendarCheck}
          color="#024BAB"
        />
        <StatCard
          label="Days left"
          value={left === null ? "—" : Math.max(0, left)}
          sub={left !== null && left < 0 ? `expired ${-left}d ago` : undefined}
          icon={Sun}
          color={left !== null && left <= 7 ? "#FA731C" : "#00C48C"}
        />
        <StatCard
          label="Outstanding"
          value={inr(o.due)}
          icon={Wallet}
          color={o.due > 0 ? "#EF4444" : "#14B8A6"}
        />
        <StatCard
          label="Locker"
          value={locker ? `#${locker.number}` : "None"}
          sub={locker?.validTill ? `till ${fmtDate(locker.validTill)}` : undefined}
          icon={TrendingUp}
          color="#A855F7"
        />
      </StatGrid>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "plans", label: "Memberships", count: memberships.length },
          { id: "bills", label: "Invoices", count: invoices.length },
          { id: "progress", label: "Progress", count: measurements.length },
          { id: "train", label: "Training" },
          { id: "about", label: "About" },
        ]}
      />

      {tab === "plans" && (
        <DataTable
          head={["Plan", "Period", "Billed", "Paid", "Status", "Actions"]}
          empty={memberships.length === 0}
        >
          {memberships.map((m: any, i: number) => (
            <Tr key={m._id} i={i}>
              <Td>
                <p className="font-black">{m.planName}</p>
                {m.isRenewal && (
                  <span className="text-[10px] font-black uppercase text-[#024BAB]">
                    Renewal
                  </span>
                )}
              </Td>
              <Td className="text-xs font-bold">
                {fmtDate(m.startDate)} → {fmtDate(m.endDate)}
                {m.freezeDaysUsed ? (
                  <p className="text-black/50">{m.freezeDaysUsed}d frozen</p>
                ) : null}
              </Td>
              <Td className="font-bold">{inr(m.totalAmount)}</Td>
              <Td>
                <span className="font-bold">{inr(m.paidAmount)}</span>
                {m.dueAmount > 0 && (
                  <p className="text-xs font-black text-red-600">
                    due {inr(m.dueAmount)}
                  </p>
                )}
              </Td>
              <Td>
                <Pill value={m.status} />
              </Td>
              <Td>
                <RowActions>
                  {live.includes(m.status) || m.status === "expired" ? (
                    <ActionButton
                      label="Renew"
                      icon={Repeat}
                      tone="primary"
                      onClick={() => setSell({ mode: "renew", membership: m })}
                    />
                  ) : null}
                  {m.status === "active" && (
                    <ActionButton
                      label="Upgrade"
                      icon={ArrowUpCircle}
                      onClick={() =>
                        setSell({ mode: "upgrade", membership: m })
                      }
                    />
                  )}
                  {m.status === "active" && (
                    <ActionButton
                      label="Freeze"
                      icon={Snowflake}
                      onClick={() => setAct({ m, a: "freeze" })}
                    />
                  )}
                  {m.status === "frozen" && (
                    <ActionButton
                      label="Unfreeze"
                      icon={Sun}
                      onClick={() =>
                        run(() => gym.memberships.unfreeze(m._id), "Unfrozen")
                      }
                    />
                  )}
                  {m.status === "active" && (
                    <ActionButton
                      label="Transfer"
                      icon={ArrowRightLeft}
                      onClick={() => setAct({ m, a: "transfer" })}
                    />
                  )}
                  {live.includes(m.status) && (
                    <ActionButton
                      label="Cancel"
                      icon={Ban}
                      tone="danger"
                      onClick={() => setAct({ m, a: "cancel" })}
                    />
                  )}
                </RowActions>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {tab === "bills" && (
        <DataTable
          head={[
            "Invoice",
            "Date",
            "Total",
            "Paid",
            "Balance",
            "Status",
            "Actions",
          ]}
          empty={invoices.length === 0}
        >
          {invoices.map((v: any, i: number) => (
            <Tr key={v._id} i={i}>
              <Td className="font-black">{v.invoiceNumber}</Td>
              <Td className="text-xs font-bold">{fmtDate(v.issuedAt)}</Td>
              <Td className="font-bold">{inr(v.totalAmount, 2)}</Td>
              <Td className="font-bold">{inr(v.paidAmount, 2)}</Td>
              <Td
                className={
                  v.balance > 0 ? "font-black text-red-600" : "text-black/30"
                }
              >
                {v.balance > 0 ? inr(v.balance, 2) : "—"}
              </Td>
              <Td>
                <Pill value={v.status} />
              </Td>
              <Td>
                <RowActions>
                  {["pending", "partial"].includes(v.status) && (
                    <ActionButton
                      label="Collect payment"
                      icon={CreditCard}
                      tone="primary"
                      onClick={() => setPay({ inv: v, mode: "pay" })}
                    />
                  )}
                  {v.paidAmount > 0 &&
                    ["paid", "partial"].includes(v.status) && (
                      <ActionButton
                        label="Refund"
                        icon={Undo2}
                        onClick={() => setPay({ inv: v, mode: "refund" })}
                      />
                    )}
                  <ActionButton
                    label="Print"
                    icon={Printer}
                    onClick={() => printInvoice(v, member)}
                  />
                </RowActions>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {tab === "progress" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Weight trend (kg)">
            <Spark points={weights} />
            <p className="text-xs font-bold text-black/50 mt-2">
              {member.fitness?.startWeightKg
                ? `Start ${member.fitness.startWeightKg} kg`
                : ""}{" "}
              {member.fitness?.targetWeightKg
                ? `· Target ${member.fitness.targetWeightKg} kg`
                : ""}
            </p>
          </Panel>
          <Panel
            title="Log"
            right={
              <a
                href="/progress"
                className="text-[11px] font-black uppercase underline"
              >
                Add check-in
              </a>
            }
          >
            {measurements.length === 0 ? (
              <p className="text-xs font-bold text-black/40 uppercase">
                No measurements yet
              </p>
            ) : (
              <ul className="divide-y divide-black/10 nb-list text-sm">
                {measurements.map((m: any) => (
                  <li key={m._id} className="py-1.5 flex justify-between gap-2">
                    <span className="font-bold">{fmtDate(m.measuredAt)}</span>
                    <span>
                      {m.weightKg ? `${m.weightKg} kg` : ""}{" "}
                      {m.bmi ? `· BMI ${m.bmi}` : ""}{" "}
                      {m.bodyFatPct ? `· ${m.bodyFatPct}% fat` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "train" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Trainers">
            {trainers.length === 0 ? (
              <p className="text-xs font-bold text-black/40 uppercase">
                None assigned
              </p>
            ) : (
              trainers.map((t: any) => (
                <p key={t._id} className="font-bold flex items-center gap-2">
                  <UserRound className="w-4 h-4" /> {t.trainerId?.name}{" "}
                  <span className="text-xs text-black/50">
                    {t.trainerId?.phone}
                  </span>
                </p>
              ))
            )}
          </Panel>
          <Panel title="Personal training">
            {pt.length === 0 ? (
              <p className="text-xs font-bold text-black/40 uppercase">
                No PT packages
              </p>
            ) : (
              pt.map((p: any) => (
                <p
                  key={p._id}
                  className="text-sm font-bold flex justify-between"
                >
                  <span>
                    {p.name} · {p.trainerId?.name}
                  </span>
                  <span>
                    {p.remainingSessions}/{p.totalSessions} left{" "}
                    <Pill value={p.status} />
                  </span>
                </p>
              ))
            )}
          </Panel>
          <Panel title="Workout plan">
            {workout ? (
              <div>
                <p className="font-black">{workout.name}</p>
                <p className="text-xs text-black/60">
                  {titleCase(workout.goal)} · {workout.days.length} day split ·{" "}
                  {workout.weeks} weeks
                </p>
                <ul className="mt-2 text-sm">
                  {workout.days.map((d: any) => (
                    <li key={d.label}>
                      <b>{d.label}</b> —{" "}
                      {d.exercises.map((e: any) => e.name).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs font-bold text-black/40 uppercase">
                No active workout plan
              </p>
            )}
          </Panel>
          <Panel title="Diet plan">
            {diet ? (
              <div>
                <p className="font-black">{diet.name}</p>
                <p className="text-xs text-black/60">
                  {diet.targetCalories} kcal · {diet.targetProteinG} g protein ·{" "}
                  {titleCase(diet.type)}
                </p>
                <ul className="mt-2 text-sm">
                  {diet.meals.map((m: any, i: number) => (
                    <li key={i}>
                      <b>{titleCase(m.slot)}</b> — {m.items}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs font-bold text-black/40 uppercase">
                No active diet plan
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "about" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <WalletPanel member={member} invoices={invoices} />
          <PrivacyPanel member={member} />
          <Panel title="Details">
            {[
              ["Gender", member.gender],
              ["Date of birth", fmtDate(member.dob)],
              ["Occupation", member.occupation],
              [
                "Address",
                [member.address, member.city, member.state, member.pincode]
                  .filter(Boolean)
                  .join(", "),
              ],
              ["Source", titleCase(member.source)],
              ["Joined", fmtDate(member.joinedOn || member.createdAt)],
            ].map(([k, v]) => (
              <p
                key={k}
                className="text-sm flex justify-between gap-3 py-1 border-b border-black/10"
              >
                <span className="text-black/50 font-bold uppercase text-[11px] tracking-widest">
                  {k}
                </span>
                <span className="font-bold text-right">{v || "—"}</span>
              </p>
            ))}
          </Panel>
          <Panel title="Health & emergency">
            {[
              ["Blood group", member.health?.bloodGroup],
              ["Allergies", member.health?.allergies],
              ["Medications", member.health?.medications],
              ["Injuries", member.health?.injuries],
              [
                "Doctor clearance",
                member.health?.doctorClearance ? "Yes" : "No",
              ],
              ["Waiver signed", fmtDate(member.health?.declarationSignedAt)],
              [
                "Emergency contact",
                [
                  member.emergencyContact?.name,
                  member.emergencyContact?.phone,
                  member.emergencyContact?.relation,
                ]
                  .filter(Boolean)
                  .join(" · "),
              ],
            ].map(([k, v]) => (
              <p
                key={k}
                className="text-sm flex justify-between gap-3 py-1 border-b border-black/10"
              >
                <span className="text-black/50 font-bold uppercase text-[11px] tracking-widest">
                  {k}
                </span>
                <span className="font-bold text-right">{v || "—"}</span>
              </p>
            ))}
          </Panel>
        </div>
      )}

      <SellMembershipModal
        open={!!sell}
        mode={sell?.mode}
        member={member}
        membership={sell?.membership}
        onClose={() => {
          setSell(null);
          refresh();
        }}
      />
      <MembershipActionModal
        membership={act?.m || null}
        action={act?.a || null}
        onClose={() => {
          setAct(null);
          refresh();
        }}
      />
      <PaymentModal
        invoice={pay?.inv || null}
        mode={pay?.mode}
        onClose={() => {
          setPay(null);
          refresh();
        }}
      />
      <PModal
        open={!!portal}
        title="Member portal login"
        subtitle={portal?.memberName}
        onClose={() => setPortal(null)}
        footer={
          <>
            <Btn light onClick={() => setPortal(null)}>
              Done
            </Btn>
            <Btn
              color="#25D366"
              onClick={() =>
                window.open(
                  `https://wa.me/${waDigits(member.phone)}?text=${encodeURIComponent(`Hi ${member.name}, your gym app login — ID: ${portal.login} Password: ${portal.password} . Sign in at ${window.location.origin}/login and change your password.`)}`,
                  "_blank",
                )
              }
            >
              <MessageCircle className="w-4 h-4" /> Send on WhatsApp
            </Btn>
          </>
        }
      >
        <p className="text-sm font-bold">
          Share these once — the password is not shown again.
        </p>
        <div className="border-2 border-black p-3 space-y-1 text-sm">
          <p>
            <span className="text-black/50 font-black uppercase text-[10px] tracking-widest">
              Login ID
            </span>
            <br />
            <b className="break-all">{portal?.login}</b>
          </p>
          <p>
            <span className="text-black/50 font-black uppercase text-[10px] tracking-widest">
              Password
            </span>
            <br />
            <b className="text-lg tracking-wider">{portal?.password}</b>
          </p>
        </div>
        {member.userId && (
          <Btn
            light
            onClick={async () => {
              await gym.members.revokePortal(member._id);
              notify.success("Portal access disabled");
              setPortal(null);
              refresh();
            }}
          >
            Disable portal access
          </Btn>
        )}
      </PModal>
    </AppLayout>
  );
}
