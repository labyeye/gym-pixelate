import { waDigits } from "@/lib/countries";
import { useState } from "react";
import { ArrowLeft, FileText, Search, X } from "lucide-react";
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

const iso = (d: Date) => todayStr(d);

type Cat = "finance" | "members";
const CATS: Record<Cat, { label: string; color: string }> = {
  finance: { label: "Finance", color: "#024BAB" },
  members: { label: "Members", color: "#00C48C" },
};
const REPORTS: { id: string; name: string; desc: string; cat: Cat; icon: any }[] = [
  { id: "overview", name: "P&L Overview", desc: "Income, expenses, profit, collections by method, revenue by type and plan sales for any date range.", cat: "finance", icon: IndianRupee },
  { id: "gst", name: "GST Register", desc: "Invoice-wise taxable value, GST and totals for filing — pick any date range.", cat: "finance", icon: FileText },
  { id: "dues", name: "Outstanding Dues", desc: "Members with unpaid balances, oldest invoice and days overdue, with WhatsApp reminders.", cat: "finance", icon: Wallet },
  { id: "renewals", name: "Upcoming Renewals", desc: "Memberships ending in the next few days so the desk can follow up before they lapse.", cat: "members", icon: CalendarClock },
  { id: "retention", name: "Churn, Cohorts & LTV", desc: "Monthly churn, how each joining-month cohort sticks around, and average lifetime value per member.", cat: "members", icon: TrendingDown },
  { id: "trainers", name: "Trainer Utilisation", desc: "Active clients per trainer against their client limit.", cat: "members", icon: UserMinus },
  { id: "birthdays", name: "Birthdays This Month", desc: "Members celebrating a birthday this month — send wishes on WhatsApp.", cat: "members", icon: Cake },
];
const CatTag = ({ cat }: { cat: Cat }) => (
  <span
    className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-black text-white"
    style={{ backgroundColor: CATS[cat].color }}
  >
    {CATS[cat].label}
  </span>
);

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
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<Cat | "all">("all");
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
  const bdays = useQuery({
    queryKey: ["rep-bday"],
    queryFn: () => gym.reports.birthdays(),
    enabled: tab === "birthdays",
  });
  const insights = useQuery({
    queryKey: ["rep-insights"],
    queryFn: () => gym.reports.insights(),
    enabled: tab === "retention" || tab === "trainers",
  });
  const gst = useQuery({
    queryKey: ["rep-gst", from, to],
    queryFn: () => gym.reports.gst(range),
    enabled: tab === "gst",
  });

  const o = overview.data?.data;
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
      case "birthdays":
        return {
          ...base, title: "Birthdays This Month", period: new Date().toLocaleString("en-IN", { month: "long", year: "numeric" }), filename: "birthdays",
          headers: ["Member", "Phone", "Day"],
          rows: (bdays.data?.data || []).map((m: any) => [m.name, m.phone, m.day]),
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
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold text-black">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate, filter, and export gym reports
        </p>
      </div>

      {tab && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setTab("")}
              className="flex items-center gap-2 border-2 border-black px-3 py-2 text-sm font-semibold bg-white hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" /> All Reports
            </button>
            <div className="flex items-center gap-2">
              <CatTag cat={REPORTS.find((r) => r.id === tab)!.cat} />
              <h2 className="text-xl font-semibold text-black">
                {REPORTS.find((r) => r.id === tab)!.name}
              </h2>
            </div>
            <button
              onClick={() => setTab("")}
              className="ml-auto border-2 border-black p-1.5 bg-white hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="border-2 border-black bg-white p-5">
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

      {tab === "retention" && (
        <div className="space-y-4">
          <StatGrid>
            <StatCard label="Avg lifetime" value={`${insights.data?.data?.ltv?.avgLifetimeMonths ?? 0} mo`} icon={CalendarClock} color="#024BAB" />
            <StatCard label="LTV per member" value={inr(insights.data?.data?.ltv?.ltv ?? 0)} icon={IndianRupee} color="#00C48C" />
            <StatCard label="Revenue / member / month" value={inr(insights.data?.data?.ltv?.revenuePerMemberMonth ?? 0)} icon={Wallet} color="#A855F7" />
            <StatCard label="Revenue / paying member" value={inr(insights.data?.data?.ltv?.revenuePerMember ?? 0)} icon={TrendingUp} color="#FA731C" />
          </StatGrid>
          <Panel title={`Member satisfaction (NPS, last 90 days) · ${insights.data?.data?.nps?.score ?? "no"} score from ${insights.data?.data?.nps?.responses ?? 0} ratings`}>
            <div className="p-4 space-y-1 text-sm">
              {(insights.data?.data?.nps?.recent || []).map((r: any, i: number) => (
                <p key={i}>
                  <b>{r.score}/10</b> · {r.name || "Member"}: {r.comment}
                </p>
              ))}
            </div>
          </Panel>
          <Panel title="Monthly churn (plan ended, did not return within 30 days)">
            <div className="p-4">
              <Bars
                rows={(insights.data?.data?.churn || []).map((r: any) => ({ label: `${r.month} · ${r.lost}/${r.ended}`, value: r.churnPct }))}
                color="#EF4444"
                fmt={(n) => `${n}%`}
              />
            </div>
          </Panel>
          <DataTable head={["Joined", "Members", "+0 mo", "+1", "+2", "+3", "+4", "+5"]} loading={insights.isLoading} empty={!(insights.data?.data?.cohorts || []).length}>
            {(insights.data?.data?.cohorts || []).map((c: any, i: number) => (
              <Tr key={c.cohort} i={i}>
                <Td className="font-black">{c.cohort}</Td>
                <Td>{c.size}</Td>
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <Td key={k} className="font-bold">
                    {c.retained[k] === undefined ? "" : `${c.retained[k]}%`}
                  </Td>
                ))}
              </Tr>
            ))}
          </DataTable>
        </div>
      )}

      {tab === "trainers" && (
        <DataTable head={["Trainer", "Clients", "Limit", "Utilisation"]} loading={insights.isLoading} empty={!(insights.data?.data?.trainers || []).length}>
          {(insights.data?.data?.trainers || []).map((t: any, i: number) => (
            <Tr key={t._id} i={i}>
              <Td className="font-black">{t.name}</Td>
              <Td>{t.clients}</Td>
              <Td>{t.maxClients || "No limit"}</Td>
              <Td className="font-bold">{t.utilisationPct === null ? "-" : `${t.utilisationPct}%`}</Td>
            </Tr>
          ))}
        </DataTable>
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
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search reports..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-2 border-black pl-9 pr-4 py-2.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#024BAB]"
          />
        </div>
        <div className="flex gap-1 border-2 border-black">
          {([["all", "All"], ["finance", "Finance"], ["members", "Members"]] as [Cat | "all", string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilterCat(id)}
              className={cn(
                "px-4 py-2 text-sm font-semibold border-r-2 border-black last:border-r-0 transition-all",
                filterCat === id ? "bg-black text-white" : "bg-white text-black hover:bg-gray-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        {(Object.keys(CATS) as Cat[]).map((c) => (
          <div key={c} className="flex items-center gap-2 border-2 border-black px-3 py-1.5 bg-white">
            <span className="w-2.5 h-2.5" style={{ backgroundColor: CATS[c].color }} />
            <span className="text-xs font-semibold text-black uppercase tracking-wider">{CATS[c].label}</span>
            <span className="text-xs font-semibold text-muted-foreground">
              {REPORTS.filter((r) => r.cat === c).length} reports
            </span>
          </div>
        ))}
      </div>

      {(Object.keys(CATS) as Cat[]).map((cat) => {
        const list = REPORTS.filter(
          (r) =>
            r.cat === cat &&
            (filterCat === "all" || filterCat === cat) &&
            `${r.name} ${r.desc}`.toLowerCase().includes(search.toLowerCase()),
        );
        if (!list.length) return null;
        return (
          <div key={cat} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-5 w-1 border border-black" style={{ backgroundColor: CATS[cat].color }} />
              <h2 className="text-base font-semibold text-black uppercase tracking-wider">
                {CATS[cat].label} ({list.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {list.map((r) => {
                const Icon = r.icon;
                const on = tab === r.id;
                return (
                  <div key={r.id} className={cn("border-2 border-black bg-white p-4 flex flex-col gap-3 transition-all", on && "border-[#024BAB] bg-[#F0F6FF]")}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 border-2 border-black flex items-center justify-center shrink-0 bg-[#024BAB]">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1"><CatTag cat={r.cat} /></div>
                        <p className="font-semibold text-black text-sm leading-tight">{r.name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">{r.desc}</p>
                    <button
                      onClick={() => setTab(on ? "" : r.id)}
                      className={cn(
                        "w-full py-2 text-sm font-semibold border-2 border-black transition-all",
                        on ? "bg-black text-white" : "bg-white text-black hover:bg-[#024BAB] hover:text-white",
                      )}
                    >
                      {on ? "Close Report" : "Generate"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </AppLayout>
  );
}
