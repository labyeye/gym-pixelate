import { waDigits } from "@/lib/countries";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Cake,
  CalendarClock,
  Download,
  IndianRupee,
  MessageCircle,
  Percent,
  Printer,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Wallet,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { settingsAPI } from "@/services/api";
import { exportCSV, exportXLSX, printReport, type ReportSpec } from "@/lib/reportExport";
import {
  Btn,
  DataTable,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  Tr,
  fmtDate,
  inputCls,
  inr,
  titleCase,
  todayStr,
} from "@/components/gym/kit";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const iso = (d: Date) => todayStr(d);

function Bars({
  rows,
  color = "#024BAB",
  fmt = inr,
}: {
  rows: { label: string; value: number }[];
  color?: string;
  fmt?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length)
    return <p className="text-xs font-bold text-black/40 uppercase">No data</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-xs font-bold mb-0.5">
            <span className="capitalize">{r.label}</span>
            <span>{fmt(r.value)}</span>
          </div>
          <div className="h-3 border-2 border-black bg-white">
            <div
              className="h-full"
              style={{
                width: `${(Math.abs(r.value) / max) * 100}%`,
                background: color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState("overview");
  const [from, setFrom] = useState(
    iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [to, setTo] = useState(iso(new Date()));
  const [days, setDays] = useState("7");
  const range = { from, to };

  const overview = useQuery({
    queryKey: ["rep-overview", from, to],
    queryFn: () => gym.reports.overview(range),
    enabled: tab === "overview",
  });
  const dues = useQuery({
    queryKey: ["rep-dues"],
    queryFn: () => gym.reports.dues(),
    enabled: tab === "dues",
  });
  const renewals = useQuery({
    queryKey: ["rep-ren", days],
    queryFn: () => gym.reports.renewals({ days }),
    enabled: tab === "renewals",
  });
  const risk = useQuery({
    queryKey: ["rep-risk"],
    queryFn: () => gym.reports.atRisk({ days: 14 }),
    enabled: tab === "risk",
  });
  const bdays = useQuery({
    queryKey: ["rep-bday"],
    queryFn: () => gym.reports.birthdays(),
    enabled: tab === "birthdays",
  });
  const heat = useQuery({
    queryKey: ["rep-heat", from, to],
    queryFn: () => gym.reports.heatmap(range),
    enabled: tab === "peak",
  });
  const gst = useQuery({
    queryKey: ["rep-gst", from, to],
    queryFn: () => gym.reports.gst(range),
    enabled: tab === "gst",
  });

  const o = overview.data?.data;
  const grid = (() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    (heat.data?.data || []).forEach((c: any) => (g[c.day][c.hour] = c.count));
    return g;
  })();
  const maxHeat = Math.max(1, ...grid.flat());
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => settingsAPI.get() });
  const company = settings.data?.data?.companyName;
  const period = `${fmtDate(from)} – ${fmtDate(to)}`;
  const spec: ReportSpec | null = (() => {
    const base = { company };
    switch (tab) {
      case "overview": {
        if (!o) return null;
        const sec = (name: string, items: [any, any][]) => items.map(([k, v]) => [name, k, v]);
        return {
          ...base, title: "P&L Overview", period, filename: `pnl-overview_${from}_${to}`,
          headers: ["Section", "Item", "Value"],
          rows: [
            ...sec("Summary", [["Income (collected)", o.income], ["Expenses", o.expenses], ["Profit", o.profit], ["Renewal retention %", o.retentionPercent ?? ""], ["New members", o.newMembers]]),
            ...sec("Collections by method", (o.byMethod || []).map((r: any) => [titleCase(r.method), r.total])),
            ...sec("Revenue by type", (o.byKind || []).map((r: any) => [titleCase(r.kind), r.amount])),
            ...sec("Expenses by category", (o.expenseByCategory || []).map((r: any) => [titleCase(r.category), r.total])),
            ...sec("Member sources", (o.sources || []).map((r: any) => [titleCase(r.source), r.count])),
            ...sec("Plan sales (billed)", (o.planSales || []).map((p: any) => [`${p.plan} (${p.sold} sold, ${p.renewals} renewals)`, p.billed])),
          ],
        };
      }
      case "dues":
        return {
          ...base, title: "Outstanding Dues", period: `As of ${fmtDate(new Date())}`, filename: "dues",
          headers: ["Member", "Code", "Phone", "Due", "Invoices", "Oldest", "Days overdue"],
          rows: (dues.data?.data || []).map((r: any) => [r.member?.name, r.member?.memberCode, r.member?.phone, r.due, r.invoices, fmtDate(r.oldest), r.daysOverdue]),
        };
      case "renewals":
        return {
          ...base, title: "Upcoming Renewals", period: `Next ${days} days`, filename: "renewals",
          headers: ["Member", "Phone", "Plan", "Ends", "Days left", "Due"],
          rows: (renewals.data?.data || []).map((r: any) => [r.member.name, r.member.phone, r.plan, fmtDate(r.endDate), r.daysLeft, r.due]),
        };
      case "risk":
        return {
          ...base, title: "At-risk Members", period: "No visit in 14 days", filename: "at-risk",
          headers: ["Member", "Phone", "Plan", "Plan ends", "Last visit", "Days absent"],
          rows: (risk.data?.data || []).map((r: any) => [r.member.name, r.member.phone, r.plan, fmtDate(r.endDate), r.lastVisit ? fmtDate(r.lastVisit) : "Never came", r.daysAbsent ?? ""]),
        };
      case "birthdays":
        return {
          ...base, title: "Birthdays This Month", period: new Date().toLocaleString("en-IN", { month: "long", year: "numeric" }), filename: "birthdays",
          headers: ["Member", "Phone", "Day"],
          rows: (bdays.data?.data || []).map((m: any) => [m.name, m.phone, m.day]),
        };
      case "peak":
        return {
          ...base, title: "Peak Hours (check-ins)", period, filename: `peak-hours_${from}_${to}`,
          headers: ["Day", ...Array.from({ length: 24 }, (_, h) => `${h}:00`)],
          rows: grid.map((row, d) => [DAYS[d], ...row]),
        };
      case "gst":
        return {
          ...base, title: "GST Register", period, filename: `gst-register_${from}_${to}`,
          headers: ["Invoice", "Date", "Member", "Taxable", "GST", "Total", "Status"],
          rows: (gst.data?.data || []).map((i: any) => [i.invoiceNumber, fmtDate(i.issuedAt), i.memberId?.name || "Walk-in", i.amount, i.gstAmount, i.totalAmount, i.status]),
        };
    }
    return null;
  })();
  const actions = spec && (
    <div className="flex gap-2 mb-4 justify-end">
      <Btn light onClick={() => printReport(spec)}><Printer className="w-4 h-4" /> Print</Btn>
      <Btn light onClick={() => exportCSV(spec)}><Download className="w-4 h-4" /> CSV</Btn>
      <Btn light onClick={() => exportXLSX(spec)}><Download className="w-4 h-4" /> Excel</Btn>
    </div>
  );
  const dateFilter = (
    <div className="flex flex-wrap gap-2 mb-5 items-center">
      <input
        type="date"
        className={inputCls + " !w-44"}
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />{" "}
      <span className="font-black">→</span>
      <input
        type="date"
        className={inputCls + " !w-44"}
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
    </div>
  );

  return (
    <AppLayout title="Reports & Insights">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "P&L overview" },
          { id: "dues", label: "Dues" },
          { id: "renewals", label: "Renewals" },
          { id: "risk", label: "At risk" },
          { id: "birthdays", label: "Birthdays" },
          { id: "peak", label: "Peak hours" },
          { id: "gst", label: "GST register" },
        ]}
      />

      {actions}

      {tab === "overview" && (
        <>
          {dateFilter}
          <StatGrid>
            <StatCard
              label="Income (collected)"
              value={inr(o?.income)}
              icon={IndianRupee}
              color="#00C48C"
            />
            <StatCard
              label="Expenses"
              value={inr(o?.expenses)}
              icon={TrendingDown}
              color="#EF4444"
            />
            <StatCard
              label="Profit"
              value={inr(o?.profit)}
              icon={TrendingUp}
              color={(o?.profit ?? 0) >= 0 ? "#024BAB" : "#EF4444"}
            />
            <StatCard
              label="Renewal retention"
              value={
                o?.retentionPercent == null ? "—" : `${o.retentionPercent}%`
              }
              sub={o ? `${o.membersUpForRenewal} up for renewal` : undefined}
              icon={Percent}
              color="#A855F7"
            />
          </StatGrid>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Collections by method">
              <Bars
                rows={(o?.byMethod || []).map((r: any) => ({
                  label: titleCase(r.method),
                  value: r.total,
                }))}
                color="#00C48C"
              />
            </Panel>
            <Panel title="Revenue by type (billed)">
              <Bars
                rows={(o?.byKind || []).map((r: any) => ({
                  label: titleCase(r.kind),
                  value: r.amount,
                }))}
              />
            </Panel>
            <Panel title="Expenses by category">
              <Bars
                rows={(o?.expenseByCategory || []).map((r: any) => ({
                  label: titleCase(r.category),
                  value: r.total,
                }))}
                color="#EF4444"
              />
            </Panel>
            <Panel title="Where members come from">
              <Bars
                rows={(o?.sources || []).map((r: any) => ({
                  label: titleCase(r.source),
                  value: r.count,
                }))}
                color="#FA731C"
                fmt={(n) => String(n)}
              />
            </Panel>
            <Panel title="Plan sales">
              <DataTable
                head={["Plan", "Sold", "Renewals", "Billed"]}
                empty={!o?.planSales?.length}
              >
                {(o?.planSales || []).map((p: any, i: number) => (
                  <Tr key={p.plan} i={i}>
                    <Td className="font-black">{p.plan}</Td>
                    <Td>{p.sold}</Td>
                    <Td>{p.renewals}</Td>
                    <Td className="font-bold">{inr(p.billed)}</Td>
                  </Tr>
                ))}
              </DataTable>
            </Panel>
            <Panel title="Enquiry funnel">
              <p className="text-sm font-bold mb-2">
                {o?.enquiries?.total ?? 0} enquiries ·{" "}
                {o?.enquiries?.converted ?? 0} joined ·{" "}
                <span className="text-[#00A070]">
                  {o?.enquiries?.conversionPercent ?? 0}% conversion
                </span>{" "}
                · {o?.newMembers ?? 0} new members
              </p>
              <Bars
                rows={Object.entries(o?.enquiries?.byStatus || {}).map(
                  ([k, v]) => ({ label: titleCase(k), value: v as number }),
                )}
                color="#A855F7"
                fmt={(n) => String(n)}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === "dues" && (
        <>
          <StatGrid cols={3}>
            <StatCard
              label="Total outstanding"
              value={inr(dues.data?.total)}
              icon={Wallet}
              color="#EF4444"
            />
            <StatCard
              label="Members with dues"
              value={dues.data?.count ?? 0}
              icon={UserMinus}
              color="#FA731C"
            />
          </StatGrid>
          <DataTable
            head={[
              "Member",
              "Phone",
              "Due",
              "Invoices",
              "Oldest",
              "Overdue",
              "Actions",
            ]}
            loading={dues.isLoading}
            empty={!(dues.data?.data || []).length}
          >
            {(dues.data?.data || []).map((r: any, i: number) => (
              <Tr key={r.member?._id || i} i={i}>
                <Td>
                  <p className="font-black">{r.member?.name}</p>
                  <p className="text-xs text-black/50">
                    {r.member?.memberCode}
                  </p>
                </Td>
                <Td>{r.member?.phone}</Td>
                <Td className="font-black text-red-600">{inr(r.due, 2)}</Td>
                <Td>{r.invoices}</Td>
                <Td className="text-xs font-bold">{fmtDate(r.oldest)}</Td>
                <Td
                  className={
                    r.daysOverdue > 14 ? "font-black text-red-600" : "font-bold"
                  }
                >
                  {r.daysOverdue}d
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Link
                      className="nb-btn px-3 py-1 text-xs bg-white"
                      to={`/members/${r.member?._id}`}
                    >
                      Collect
                    </Link>
                    {r.member?.phone && (
                      <a
                        className="nb-btn px-3 py-1 text-xs bg-[#25D366] text-white"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://wa.me/${waDigits(r.member.phone)}?text=${encodeURIComponent(`Hi ${r.member.name}, a gentle reminder: ₹${r.due} is pending at the gym. Please pay at your earliest.`)}`}
                      >
                        <MessageCircle className="inline w-3 h-3" /> Remind
                      </a>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </>
      )}

      {tab === "renewals" && (
        <>
          <div className="flex gap-2 mb-5 items-center">
            <select
              className={inputCls + " !w-48 font-bold"}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              {["3", "7", "15", "30"].map((d) => (
                <option key={d} value={d}>
                  Next {d} days
                </option>
              ))}
            </select>
            <span className="text-xs font-bold text-black/50">
              includes plans that lapsed in the last 15 days
            </span>
          </div>
          <DataTable
            head={["Member", "Plan", "Ends", "Left", "Due", "Actions"]}
            loading={renewals.isLoading}
            empty={!(renewals.data?.data || []).length}
          >
            {(renewals.data?.data || []).map((r: any, i: number) => (
              <Tr key={r.membershipId} i={i}>
                <Td>
                  <p className="font-black">{r.member.name}</p>
                  <p className="text-xs text-black/50">{r.member.phone}</p>
                </Td>
                <Td className="font-bold">{r.plan}</Td>
                <Td className="text-xs font-bold">{fmtDate(r.endDate)}</Td>
                <Td>
                  <span
                    className={cn(
                      "font-black",
                      r.daysLeft < 0
                        ? "text-red-600"
                        : r.daysLeft <= 3
                          ? "text-[#FA731C]"
                          : "",
                    )}
                  >
                    {r.daysLeft < 0
                      ? `lapsed ${-r.daysLeft}d`
                      : `${r.daysLeft}d`}
                  </span>
                </Td>
                <Td>{r.due > 0 ? inr(r.due) : "—"}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Link
                      className="nb-btn px-3 py-1 text-xs bg-[#024BAB] text-white"
                      to={`/members/${r.member._id}`}
                    >
                      Renew
                    </Link>
                    {r.whatsapp && (
                      <a
                        className="nb-btn px-3 py-1 text-xs bg-[#25D366] text-white"
                        target="_blank"
                        rel="noreferrer"
                        href={r.whatsapp}
                      >
                        <MessageCircle className="inline w-3 h-3" /> WhatsApp
                      </a>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </>
      )}

      {tab === "risk" && (
        <>
          <p className="text-xs font-bold text-black/60 mb-3">
            Paying members with no visit in the last 14 days — a call now is
            cheaper than losing the renewal.
          </p>
          <DataTable
            head={[
              "Member",
              "Plan",
              "Plan ends",
              "Last visit",
              "Absent",
              "Actions",
            ]}
            loading={risk.isLoading}
            empty={!(risk.data?.data || []).length}
          >
            {(risk.data?.data || []).map((r: any, i: number) => (
              <Tr key={r.member._id} i={i}>
                <Td>
                  <p className="font-black">{r.member.name}</p>
                  <p className="text-xs text-black/50">{r.member.phone}</p>
                </Td>
                <Td className="font-bold">{r.plan}</Td>
                <Td className="text-xs font-bold">{fmtDate(r.endDate)}</Td>
                <Td className="text-xs font-bold">
                  {r.lastVisit ? fmtDate(r.lastVisit) : "Never came"}
                </Td>
                <Td className="font-black text-red-600">
                  {r.daysAbsent != null ? `${r.daysAbsent}d` : "—"}
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <a
                      className="nb-btn px-3 py-1 text-xs bg-[#25D366] text-white"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/${waDigits(r.member.phone)}?text=${encodeURIComponent(`Hi ${r.member.name}, we've missed you at the gym! Everything okay? Come in this week — your trainer is ready to help you get back on track.`)}`}
                    >
                      <MessageCircle className="inline w-3 h-3" /> Nudge
                    </a>
                  </div>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </>
      )}

      {tab === "birthdays" && (
        <DataTable
          head={["Member", "Phone", "Birthday", "Actions"]}
          loading={bdays.isLoading}
          empty={!(bdays.data?.data || []).length}
        >
          {(bdays.data?.data || []).map((m: any, i: number) => (
            <Tr key={m._id} i={i}>
              <Td className="font-black">
                <Cake className="inline w-4 h-4 mr-1" /> {m.name}
              </Td>
              <Td>{m.phone}</Td>
              <Td className="font-bold">
                {m.day} {new Date().toLocaleString("en-IN", { month: "long" })}
              </Td>
              <Td>
                <div className="flex justify-end">
                  <a
                    className="nb-btn px-3 py-1 text-xs bg-[#25D366] text-white"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/${waDigits(m.phone)}?text=${encodeURIComponent(`Happy Birthday ${m.name}! 🎉 Wishing you strength and health from all of us at the gym.`)}`}
                  >
                    Wish
                  </a>
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {tab === "peak" && (
        <>
          {dateFilter}
          <div className="border-2 border-black bg-white p-3 overflow-x-auto">
            <table className="text-[10px] font-bold">
              <thead>
                <tr>
                  <th />
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="px-0.5 w-7 text-center">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, d) => (
                  <tr key={d}>
                    <td className="pr-2 font-black uppercase">{DAYS[d]}</td>
                    {row.map((n, h) => (
                      <td
                        key={h}
                        title={`${DAYS[d]} ${h}:00 — ${n} check-ins`}
                        className="w-7 h-7 border border-white text-center"
                        style={{
                          background: n
                            ? `rgba(2,75,171,${0.12 + (n / maxHeat) * 0.88})`
                            : "#f3f4f6",
                          color: n / maxHeat > 0.5 ? "#fff" : "#0a0a0a",
                        }}
                      >
                        {n || ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs font-bold text-black/50 mt-2">
            Check-ins by weekday and hour (IST). Schedule classes and staff
            around the dark cells.
          </p>
        </>
      )}

      {tab === "gst" && (
        <>
          {dateFilter}
          <StatGrid>
            <StatCard
              label="Taxable value"
              value={inr(gst.data?.totals?.taxable)}
              icon={IndianRupee}
              color="#024BAB"
            />
            <StatCard
              label="CGST"
              value={inr(gst.data?.totals?.cgst)}
              icon={Percent}
              color="#A855F7"
            />
            <StatCard
              label="SGST"
              value={inr(gst.data?.totals?.sgst)}
              icon={Percent}
              color="#FA731C"
            />
            <StatCard
              label="Invoice total"
              value={inr(gst.data?.totals?.total)}
              icon={CalendarClock}
              color="#00C48C"
            />
          </StatGrid>
          <DataTable
            head={[
              "Invoice",
              "Date",
              "Member",
              "Taxable",
              "GST",
              "Total",
              "Status",
            ]}
            loading={gst.isLoading}
            empty={!(gst.data?.data || []).length}
          >
            {(gst.data?.data || []).map((v: any, i: number) => (
              <Tr key={v._id} i={i}>
                <Td className="font-black">{v.invoiceNumber}</Td>
                <Td className="text-xs font-bold">{fmtDate(v.issuedAt)}</Td>
                <Td>{v.memberId?.name || "Walk-in"}</Td>
                <Td>{inr(v.amount, 2)}</Td>
                <Td>{inr(v.gstAmount, 2)}</Td>
                <Td className="font-bold">{inr(v.totalAmount, 2)}</Td>
                <Td>
                  <Pill value={v.status} />
                </Td>
              </Tr>
            ))}
          </DataTable>
        </>
      )}
    </AppLayout>
  );
}
