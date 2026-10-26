import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, inr } from "./kit";

export interface Point {
  /** yyyy-mm-dd for daily points, "Oct 26" style label for monthly points */
  key: string;
  value: number;
}

const RANGES = [
  { m: 1, label: "1M" },
  { m: 3, label: "3M" },
  { m: 6, label: "6M" },
];

/**
 * Dashboard graph with 1M / 3M / 6M buttons top right. Default = last 7 days (daily bars);
 * 1M = last 30 days (daily), 3M / 6M = monthly bars. Click the active button again to go back to 7 days.
 */
export default function RangeChartPanel({
  title,
  color,
  daily,
  monthly,
  money,
  seriesName,
}: {
  title: string;
  color: string;
  daily: Point[];
  monthly: Point[];
  /** format the numbers as rupees */
  money?: boolean;
  seriesName: string;
}) {
  const [range, setRange] = useState<number | null>(null);
  const weekday = (k: string) => new Date(k).toLocaleDateString("en-IN", { weekday: "short" });
  let data: { label: string; value: number }[];
  let caption: string;
  if (range === null) {
    data = daily.slice(-7).map((p) => ({ label: weekday(p.key), value: p.value }));
    caption = "last 7 days";
  } else if (range === 1) {
    data = daily.map((p) => ({ label: p.key.slice(8), value: p.value }));
    caption = "last 30 days";
  } else {
    data = monthly.slice(-range).map((p) => ({ label: p.key, value: p.value }));
    caption = `last ${range} months`;
  }
  const total = data.reduce((s, p) => s + p.value, 0);
  const fmt = (n: number) => (money ? inr(n) : String(n));
  return (
    <Panel
      title={`${title} — ${caption}`}
      right={
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.m}
              onClick={() => setRange(range === r.m ? null : r.m)}
              className={`px-2.5 py-1 text-[11px] font-black border-2 border-black rounded-full ${range === r.m ? "bg-[#024BAB] text-white" : "bg-white"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="text-xs font-bold text-black/60 mb-2">
        {fmt(Math.round(total))} in this period
      </p>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} interval={range === 1 ? 4 : 0} />
          <YAxis tick={{ fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} width={money ? 44 : 28} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: `${color}22` }}
            formatter={(v: any) => [fmt(Number(v)), seriesName]}
            contentStyle={{ border: "2px solid #000", borderRadius: 0, fontSize: 12, fontWeight: 700 }}
          />
          <Bar dataKey="value" name={seriesName} fill={color} stroke="#0A0A0A" strokeWidth={2} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
