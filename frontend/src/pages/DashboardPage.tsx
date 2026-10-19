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
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { dashboardService } from "@/services/dashboardService";
import { gym } from "@/services/gymApi";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, StatCard, fmtDate, inr } from "@/components/gym/kit";

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

export default function DashboardPage() {
  const { user, tenant } = useAuth();
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
  const sessions = useQuery({
    queryKey: ["dash-classes"],
    queryFn: () => gym.classes.sessions({ days: 1 }),
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {money && (
          <Panel title="Collections — last 30 days">
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={ch.revenueByDay || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#E5E7EB"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d.slice(8)}
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<NbTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#024BAB"
                  strokeWidth={3}
                  fill="#024BAB22"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        )}
        <Panel title="New memberships — 12 months">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={ch.membershipGrowth || []}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E5E7EB"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip content={<NbTooltip />} cursor={{ fill: "#024BAB22" }} />
              <Bar
                dataKey="newMemberships"
                name="New"
                fill="#00C48C"
                stroke="#0A0A0A"
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel
          title="Today's classes"
          right={
            <Link
              to="/classes"
              className="text-[11px] font-black uppercase underline"
            >
              All
            </Link>
          }
        >
          {(sessions.data?.data || []).length === 0 ? (
            <Empty>No classes left today</Empty>
          ) : (
            <ul className="nb-list divide-y divide-black/10">
              {(sessions.data?.data || []).slice(0, 6).map((x: any) => (
                <li
                  key={x.classId + x.sessionDate}
                  className="py-2 flex justify-between gap-2 text-sm"
                >
                  <span className="font-black">
                    {new Date(x.sessionDate).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {x.name}
                  </span>
                  <span className="font-bold text-black/60">
                    {x.booked}/{x.capacity}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
        {money && (
          <Panel
            title="Biggest dues"
            right={
              <Link
                to="/reports"
                className="text-[11px] font-black uppercase underline"
              >
                All
              </Link>
            }
          >
            {(dues.data?.data || []).length === 0 ? (
              <Empty>All clear</Empty>
            ) : (
              <ul className="nb-list divide-y divide-black/10">
                {(dues.data?.data || [])
                  .slice(0, 6)
                  .map((r: any, i: number) => (
                    <li
                      key={i}
                      className="py-2 flex items-center justify-between gap-2 text-sm"
                    >
                      <Link
                        to={`/members/${r.member?._id}`}
                        className="font-black truncate hover:underline"
                      >
                        {r.member?.name}
                      </Link>
                      <span className="font-black text-red-600">
                        {inr(r.due)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        )}
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
