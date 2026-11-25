import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { FadeIn } from "@/components/motion/FadeIn";
import { Panel, StatCard, Tabs, inr } from "@/components/gym/kit";
import { gym } from "@/services/gymApi";
import { IndianRupee, Percent, Repeat, UserCheck } from "lucide-react";

type Pt = { label: string; value: number };

const CATEGORIES = [
  { id: "revenue", label: "Revenue" },
  { id: "members", label: "Members" },
  { id: "plans", label: "Plans" },
  { id: "retention", label: "Retention" },
  { id: "attendance", label: "Attendance" },
  { id: "locations", label: "Locations" },
];
const COLORS = ["#024BAB", "#FA731C", "#00C48C", "#A855F7", "#EF4444", "#FFD60A", "#14B8A6"];
const TIP = { border: "2px solid #000", borderRadius: 0, fontSize: 12, fontWeight: 700 };
const axis = { fontSize: 10, fontWeight: 700 };

const nice = (s: string) => s.replace(/_/g, " ");
// "2026-11" -> "Nov 26", "2026-11-25" -> "25 Nov"
const short = (s: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s) : /^\d{4}-\d{2}$/.test(s) ? new Date(s + "-01") : null;
  if (!d) return nice(s);
  return /^\d{4}-\d{2}$/.test(s)
    ? d.toLocaleString("en", { month: "short", year: "2-digit" })
    : d.toLocaleString("en", { day: "numeric", month: "short" });
};

function Trend({ data, color = "#024BAB", money }: { data: Pt[]; color?: string; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data.map((d) => ({ ...d, label: short(d.label) }))}>
        <defs>
          <linearGradient id={`g${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={money ? 48 : 30} allowDecimals={false} />
        <Tooltip contentStyle={TIP} formatter={(v: any) => [money ? inr(Number(v)) : v, ""]} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#g${color.slice(1)})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Columns({ data, color = "#024BAB", money, horizontal }: { data: Pt[]; color?: string; money?: boolean; horizontal?: boolean }) {
  const d = data.map((x) => ({ ...x, label: nice(short(x.label)) }));
  return (
    <ResponsiveContainer width="100%" height={horizontal ? Math.max(180, d.length * 34) : 230}>
      <BarChart data={d} layout={horizontal ? "vertical" : "horizontal"}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={!horizontal} horizontal={!!horizontal ? false : true} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axis} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={money ? 48 : 30} allowDecimals={false} />
          </>
        )}
        <Tooltip cursor={{ fill: `${color}22` }} contentStyle={TIP} formatter={(v: any) => [money ? inr(Number(v)) : v, ""]} />
        <Bar dataKey="value" fill={color} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} stroke="#0A0A0A" strokeWidth={2} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Donut({ data }: { data: Pt[] }) {
  const d = data.filter((x) => x.value > 0).map((x) => ({ ...x, label: nice(x.label) }));
  if (!d.length) return <Empty />;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <ResponsiveContainer width={170} height={170}>
        <PieChart>
          <Pie data={d} dataKey="value" nameKey="label" innerRadius={45} outerRadius={80} stroke="#000" strokeWidth={2}>
            {d.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TIP} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-1 text-xs font-bold">
        {d.map((x, i) => (
          <li key={x.label} className="flex items-center gap-2 capitalize">
            <span className="w-3 h-3 border border-black" style={{ background: COLORS[i % COLORS.length] }} />
            {x.label} — {x.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

const Empty = () => <p className="text-xs font-bold text-black/40 uppercase py-6">No data yet</p>;
const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">{children}</div>
);
const sum = (a: Pt[] = []) => a.reduce((n, x) => n + x.value, 0);

function Revenue({ d }: { d: any }) {
  const best = [...d.monthly].sort((a: Pt, b: Pt) => b.value - a.value)[0];
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Last 30 days" value={<AnimatedNumber value={sum(d.daily)} prefix="₹" />} icon={IndianRupee} color="#00C48C" />
        <StatCard label="Last 12 months" value={<AnimatedNumber value={sum(d.monthly)} prefix="₹" />} icon={IndianRupee} color="#024BAB" />
        <StatCard label="Best month" value={best ? short(best.label) : "—"} sub={best ? inr(best.value) : undefined} icon={IndianRupee} color="#FA731C" />
      </div>
      <Panel title="Collections — last 30 days">{d.daily.length ? <Trend data={d.daily} color="#00C48C" money /> : <Empty />}</Panel>
      <div className="h-4" />
      <Grid>
        <Panel title="Month by month">{d.monthly.length ? <Columns data={d.monthly} money /> : <Empty />}</Panel>
        <Panel title="Payment methods">
          <Donut data={d.byMethod} />
        </Panel>
      </Grid>
    </>
  );
}

function Members({ d }: { d: any }) {
  return (
    <>
      <Panel title="New members — last 12 months">{d.growth.length ? <Trend data={d.growth} /> : <Empty />}</Panel>
      <div className="h-4" />
      <Grid>
        <Panel title="Gender"><Donut data={d.gender} /></Panel>
        <Panel title="Status"><Donut data={d.status} /></Panel>
        <Panel title="Age groups"><Columns data={d.ageBands} color="#A855F7" /></Panel>
        <Panel title="Where members come from">{d.source.length ? <Columns data={d.source} color="#FA731C" horizontal /> : <Empty />}</Panel>
      </Grid>
    </>
  );
}

function Plans({ d }: { d: any }) {
  return (
    <Grid>
      <Panel title="Most popular plans">{d.popularity.length ? <Columns data={d.popularity.slice(0, 8)} horizontal /> : <Empty />}</Panel>
      <Panel title="Revenue by plan">{d.revenue.length ? <Columns data={d.revenue.slice(0, 8)} color="#00C48C" money horizontal /> : <Empty />}</Panel>
      <Panel title="Renewals vs new joins"><Donut data={d.renewalMix} /></Panel>
    </Grid>
  );
}

function Retention({ d }: { d: any }) {
  const last = d.churn[d.churn.length - 1];
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Churn this month" value={<AnimatedNumber value={last?.churnPct ?? 0} suffix="%" />} icon={Percent} color="#EF4444" />
        <StatCard label="Avg stay (months)" value={d.ltv.avgLifetimeMonths} icon={UserCheck} color="#024BAB" />
        <StatCard label="Revenue / member / month" value={<AnimatedNumber value={d.ltv.revenuePerMemberMonth} prefix="₹" />} icon={Repeat} color="#FA731C" />
        <StatCard label="Lifetime value" value={<AnimatedNumber value={d.ltv.ltv} prefix="₹" />} icon={IndianRupee} color="#00C48C" />
      </div>
      <Grid>
        <Panel title="Churn % by month"><Trend data={d.churn.map((c: any) => ({ label: c.month, value: c.churnPct }))} color="#EF4444" /></Panel>
        <Panel title="Cohort retention (% still active)">
          {d.cohorts.some((c: any) => c.size) ? (
            <div className="overflow-x-auto">
              <table className="text-xs font-bold w-full">
                <thead>
                  <tr className="text-left text-black/50">
                    <th className="pr-2">Joined</th>
                    <th className="pr-2">Size</th>
                    {d.cohorts[0].retained.map((_: any, i: number) => (
                      <th key={i} className="px-1">+{i}m</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.cohorts.map((c: any) => (
                    <tr key={c.cohort}>
                      <td className="pr-2 py-1">{short(c.cohort)}</td>
                      <td className="pr-2">{c.size}</td>
                      {c.retained.map((r: number, i: number) => (
                        <td key={i} className="px-1">
                          <span className="block text-center py-1 border border-black" style={{ background: `rgba(2,75,171,${r / 100})`, color: r > 50 ? "#fff" : "#000" }}>{r}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </Panel>
      </Grid>
    </>
  );
}

function Attendance({ d }: { d: any }) {
  if (!d.total) return <Panel title="Attendance — last 30 days"><Empty /></Panel>;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Check-ins (30 days)" value={<AnimatedNumber value={d.total} />} icon={UserCheck} color="#024BAB" />
      </div>
      <Panel title="Daily check-ins"><Trend data={d.daily} /></Panel>
      <div className="h-4" />
      <Grid>
        <Panel title="Busiest days"><Columns data={d.byWeekday} color="#FA731C" /></Panel>
        <Panel title="Peak hours"><Columns data={d.byHour} color="#A855F7" /></Panel>
        <Panel title="How members check in"><Donut data={d.byMode} /></Panel>
      </Grid>
    </>
  );
}

function Locations({ d }: { d: any }) {
  return (
    <>
      <Grid>
        <Panel title="Members by branch">{d.branches.length ? <Columns data={d.branches.map((b: any) => ({ label: b.label, value: b.members }))} horizontal /> : <Empty />}</Panel>
        <Panel title="Revenue by branch">{d.branches.length ? <Columns data={d.branches.map((b: any) => ({ label: b.label, value: b.revenue }))} color="#00C48C" money horizontal /> : <Empty />}</Panel>
        <Panel title="Top cities">{d.cities.length ? <Columns data={d.cities} color="#FA731C" horizontal /> : <Empty />}</Panel>
        <Panel title="Top pincodes (catchment area)">{d.pincodes.length ? <Columns data={d.pincodes} color="#A855F7" horizontal /> : <Empty />}</Panel>
      </Grid>
      <p className="text-xs font-bold text-black/50">City and pincode come from the address saved on each member profile.</p>
    </>
  );
}

const VIEWS: Record<string, (p: { d: any }) => JSX.Element> = {
  revenue: Revenue, members: Members, plans: Plans, retention: Retention, attendance: Attendance, locations: Locations,
};

export default function InsightsPage() {
  const [cat, setCat] = useState("revenue");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["insights", cat],
    queryFn: () => gym.reports.analytics({ category: cat }),
  });
  const View = VIEWS[cat];
  const d = (data as any)?.data ?? data;
  return (
    <AppLayout title="Insights">
      <div className="mb-4">
        <h2 className="font-display font-bold text-2xl">Insights</h2>
        <p className="text-sm font-medium text-muted-foreground mt-0.5">Pick a category to see how your gym is doing.</p>
      </div>
      <Tabs tabs={CATEGORIES} value={cat} onChange={setCat} />
      {isLoading ? (
        <p className="text-sm font-bold text-black/50">Loading…</p>
      ) : isError || !d ? (
        <p className="text-sm font-bold text-red-600">Couldn't load insights. Try again.</p>
      ) : (
        <FadeIn key={cat}>
          <View d={d} />
        </FadeIn>
      )}
    </AppLayout>
  );
}
