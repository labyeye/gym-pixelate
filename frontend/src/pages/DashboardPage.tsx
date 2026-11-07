import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCheck,
  BadgeX,
  Boxes,
  Cake,
  CalendarClock,
  Clock3,
  IndianRupee,
  Loader2,
  Megaphone,
  Receipt,
  RefreshCw,
  Snowflake,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { dashboardService } from "@/services/dashboardService";
import { gym } from "@/services/gymApi";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, StatCard, fmtDate, inr, titleCase } from "@/components/gym/kit";
import RangeChartPanel from "@/components/gym/RangeChartPanel";
import { moduleOn } from "@/config/modules";

const NbTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border-2 border-black px-3 py-2 text-xs">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-bold">
          {p.name}: {p.name === "Revenue" ? inr(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-black uppercase tracking-widest text-black/30 py-4 text-center">
    {children}
  </p>
);

const MiniList = ({
  rows,
  empty,
}: {
  rows: { id: any; a: string; b: string; c: string }[];
  empty: string;
}) =>
  rows.length === 0 ? (
    <Empty>{empty}</Empty>
  ) : (
    <ul className="nb-list divide-y divide-black/10">
      {rows.map((r) => (
        <li
          key={r.id}
          className="py-2 flex items-center justify-between gap-2 text-sm"
        >
          <div className="min-w-0">
            <p className="font-black truncate">{r.a}</p>
            <p className="text-xs text-black/50 truncate">{r.b}</p>
          </div>
          <span className="font-black whitespace-nowrap">{r.c}</span>
        </li>
      ))}
    </ul>
  );

export default function DashboardPage() {
  const { user, tenant, modules } = useAuth();
  const manager = !!user && ["gym_owner", "branch_manager"].includes(user.role);
  const money =
    !!user && ["gym_owner", "branch_manager", "accountant"].includes(user.role);
  const desk =
    !!user &&
    ["gym_owner", "branch_manager", "receptionist"].includes(user.role);

  const { data: s, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardService.getSummary(),
    refetchInterval: 60_000,
  });
  const { data: c } = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn: () => dashboardService.getCharts(),
  });
  const renew = useQuery({
    queryKey: ["dash-renewals"],
    queryFn: () => gym.reports.renewals({ days: 7, includeLapsed: "false" }),
    enabled: desk,
  });
  const dues = useQuery({
    queryKey: ["dash-dues"],
    queryFn: () => gym.reports.dues(),
    enabled: money,
  });
  const bday = useQuery({
    queryKey: ["dash-bday"],
    queryFn: () => gym.reports.birthdays(),
    enabled: desk,
  });
  const ann = useQuery({
    queryKey: ["dash-ann"],
    queryFn: () => gym.announcements.active(),
  });
  const log = useQuery({
    queryKey: ["dash-activity"],
    queryFn: () =>
      import("@/services/api").then((m) => m.request<any>("/activity?limit=8")),
    enabled: manager,
    retry: false,
  });

  const st = s?.data || {};
  const ch = c?.data || {};
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().getDate();
  const todaysBirthdays = (bday.data?.data || []).filter(
    (m: any) => m.day === today,
  );
  const daysLeftTrial =
    tenant && (tenant as any).planExpiresAt
      ? Math.ceil(
          (new Date((tenant as any).planExpiresAt).getTime() - Date.now()) /
            86400000,
        )
      : null;

  if (isLoading)
    return (
      <AppLayout title="Dashboard">
        <div className="flex h-[70vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#024BAB]" />
        </div>
      </AppLayout>
    );

  return (
    <AppLayout title="Dashboard">
      <div className="mb-5">
        <h2 className="font-display font-bold text-2xl">
          {greeting}, {user?.name?.split(" ")[0]}
        </h2>
        <p className="text-sm font-medium text-muted-foreground mt-0.5">
          Here's what's happening at your gym today
        </p>
      </div>

      {tenant?.plan === "trial" && user?.role === "gym_owner" && (
        <Link
          to="/subscription"
          className="nb-rise block border-2 border-black bg-[#FA731C]/15 p-3 mb-5 text-sm font-bold hover:bg-[#FA731C]/25"
        >
          Free trial
          {daysLeftTrial != null
            ? `: ${Math.max(0, daysLeftTrial)} days left`
            : ""}{" "}
          — pick a plan to keep your data flowing →
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {money && (
          <StatCard
            label="Collected today"
            value={inr(st.todayRevenue)}
            icon={IndianRupee}
            color="#00C48C"
          />
        )}
        <StatCard
          label="New members today"
          value={st.newMembersToday ?? 0}
          icon={Users}
          color="#14B8A6"
        />
        <StatCard
          label="Active memberships"
          value={st.activeMemberships ?? 0}
          icon={BadgeCheck}
          color="#84CC16"
        />
        <StatCard
          label="Expired"
          value={st.expiredMemberships ?? 0}
          icon={BadgeX}
          color="#EF4444"
        />
        <StatCard
          label="Renewals (7 days)"
          value={st.pendingRenewals ?? 0}
          icon={Clock3}
          color="#FA731C"
        />
        {money && (
          <StatCard
            label="This month"
            value={inr(st.monthlyRevenue)}
            icon={Wallet}
            color="#00C48C"
          />
        )}
        {money && (
          <StatCard
            label="Dues outstanding"
            value={inr(st.pendingPayments)}
            icon={Receipt}
            color={st.pendingPayments > 0 ? "#EF4444" : "#14B8A6"}
            sub={`${st.membersWithDues ?? 0} members`}
          />
        )}
        <StatCard
          label="Low-stock products"
          value={st.lowStockProducts ?? 0}
          icon={Boxes}
          color={st.lowStockProducts ? "#EF4444" : "#14B8A6"}
        />
        <StatCard
          label="Equipment service due"
          value={st.equipmentServiceDue ?? 0}
          icon={Wrench}
          color={st.equipmentServiceDue ? "#FA731C" : "#14B8A6"}
        />
        <StatCard
          label="Total members"
          value={st.totalMembers ?? 0}
          icon={Users}
          color="#024BAB"
          sub={`${st.newMembersThisMonth ?? 0} joined this month`}
        />
        <StatCard
          label="Renewed this month"
          value={st.renewedThisMonth ?? 0}
          icon={RefreshCw}
          color="#00C48C"
        />
        <StatCard
          label="Frozen memberships"
          value={st.frozenMemberships ?? 0}
          icon={Snowflake}
          color="#38BDF8"
        />
      </div>

      {money && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <RangeChartPanel
            title="Collections"
            seriesName="Collected"
            color="#024BAB"
            money
            daily={(ch.revenueByDay || []).map((d: any) => ({
              key: d.date,
              value: d.revenue,
            }))}
            monthly={(ch.revenueByMonth || []).map((d: any) => ({
              key: d.month,
              value: d.revenue,
            }))}
          />
          <Panel title="Recent collections">
            <MiniList
              empty="No payments yet"
              rows={(st.recentCollections || []).map((r: any, i: number) => ({
                id: i,
                a: r.name || "Walk-in",
                b: `${titleCase(r.method || "")} · ${fmtDate(r.at)}`,
                c: inr(r.amount),
              }))}
            />
          </Panel>
        </div>
      )}

      {(money || desk) && moduleOn(modules, "pos") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Panel title="Recent shop / POS sales" className="lg:order-1 order-2">
            <MiniList
              empty="No sales yet"
              rows={(st.recentPos || []).map((r: any) => ({
                id: r._id,
                a: r.name || "Walk-in",
                b: `${r.number || ""} · ${fmtDate(r.at)}`,
                c: inr(r.amount),
              }))}
            />
          </Panel>
          <div className="lg:order-2 order-1">
            <RangeChartPanel
              title="Shop / POS revenue"
              seriesName="POS sales"
              color="#FA731C"
              money
              daily={(ch.posByDay || []).map((d: any) => ({
                key: d.date,
                value: d.revenue,
              }))}
              monthly={(ch.posByMonth || []).map((d: any) => ({
                key: d.month,
                value: d.revenue,
              }))}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <RangeChartPanel
          title="New memberships"
          seriesName="New"
          color="#00C48C"
          daily={(ch.membersByDay || []).map((d: any) => ({
            key: d.date,
            value: d.count,
          }))}
          monthly={(ch.membershipGrowth || []).map((d: any) => ({
            key: d.month,
            value: d.newMemberships,
          }))}
        />
        <Panel title="Recent memberships sold">
          <MiniList
            empty="No memberships yet"
            rows={(st.recentMemberships || []).map((r: any) => ({
              id: r._id,
              a: r.memberId?.name || "—",
              b: `${r.planName} · ${fmtDate(r.createdAt)}`,
              c: money ? inr(r.totalAmount) : "",
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {desk && (
          <Panel
            title="Renew this week"
            right={
              <Link
                to="/reports"
                className="text-[11px] font-black uppercase underline"
              >
                All
              </Link>
            }
          >
            {(renew.data?.data || []).length === 0 ? (
              <Empty>Nobody expiring</Empty>
            ) : (
              <ul className="nb-list divide-y divide-black/10">
                {(renew.data?.data || []).slice(0, 6).map((r: any) => (
                  <li
                    key={r.membershipId}
                    className="py-2 flex items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      to={`/members/${r.member._id}`}
                      className="font-black truncate hover:underline"
                    >
                      {r.member.name}
                    </Link>
                    <span
                      className={`nb-badge ${r.daysLeft <= 2 ? "nb-tag-red" : "nb-tag-orange"}`}
                    >
                      {r.daysLeft <= 0 ? "today" : `${r.daysLeft}d`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        <Panel title="Recent renewals">
          {(st.recentRenewals || []).length === 0 ? (
            <Empty>No renewals yet</Empty>
          ) : (
            <ul className="nb-list divide-y divide-black/10">
              {st.recentRenewals.map((r: any) => (
                <li
                  key={r._id}
                  className="py-2 flex items-center justify-between gap-2 text-sm"
                >
                  <span className="font-black truncate">
                    {r.memberId?.name}
                  </span>
                  <span className="text-xs text-black/60 whitespace-nowrap">
                    {r.planName} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="New members this month">
          {(st.newMembersList || []).length === 0 ? (
            <Empty>No new members yet</Empty>
          ) : (
            <ul className="nb-list divide-y divide-black/10">
              {st.newMembersList.map((r: any) => (
                <li
                  key={r._id}
                  className="py-2 flex items-center justify-between gap-2 text-sm"
                >
                  <Link
                    to={`/members/${r._id}`}
                    className="font-black truncate hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="text-xs text-black/60 whitespace-nowrap">
                    {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Active members by plan">
          {(st.planMix || []).length === 0 ? (
            <Empty>No active memberships</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase text-black/50">
                  <th className="py-1">Plan</th>
                  <th className="py-1 text-right">Members</th>
                  {money && <th className="py-1 text-right">Billed</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {st.planMix.map((p: any) => (
                  <tr key={p.plan}>
                    <td className="py-2 font-bold">{p.plan}</td>
                    <td className="py-2 text-right font-black">{p.members}</td>
                    {money && (
                      <td className="py-2 text-right">{inr(p.billed)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Plan popularity">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={st.planMix || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="plan" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip content={<NbTooltip />} />
                <Bar dataKey="members" name="Members" fill="#024BAB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Announcements" right={<Megaphone className="w-4 h-4" />}>
          {(ann.data?.data || []).length === 0 ? (
            <Empty>Nothing posted</Empty>
          ) : (
            <ul className="space-y-2">
              {(ann.data?.data || []).slice(0, 4).map((a: any) => (
                <li key={a._id} className="border-l-4 border-[#FA731C] pl-2">
                  <p className="font-black text-sm">
                    {a.pinned && "📌 "}
                    {a.title}
                  </p>
                  <p className="text-xs text-black/60 line-clamp-2">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Birthdays today" right={<Cake className="w-4 h-4" />}>
          {todaysBirthdays.length === 0 ? (
            <Empty>None today</Empty>
          ) : (
            <ul className="space-y-1.5">
              {todaysBirthdays.map((m: any) => (
                <li
                  key={m._id}
                  className="text-sm font-bold flex justify-between"
                >
                  <span>🎂 {m.name}</span>
                  <span className="text-black/50">{m.phone}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {manager && (
          <Panel
            title="Recent activity"
            right={<CalendarClock className="w-4 h-4" />}
          >
            {(log.data?.data || []).length === 0 ? (
              <Empty>No activity yet</Empty>
            ) : (
              <ul className="nb-list space-y-1.5">
                {(log.data?.data || []).slice(0, 8).map((a: any) => (
                  <li key={a._id} className="text-xs">
                    <b>{a.userName}</b>{" "}
                    <span className="text-black/60">{a.description}</span>{" "}
                    <span className="text-black/30">
                      · {fmtDate(a.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </AppLayout>
  );
}
