import io

p = r"D:\projects\Pixelate Nest\NestGym\frontend\src\pages\gym\ReportsPage.tsx"
s = io.open(p, newline="", encoding="utf-8").read()
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")


def need(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)


need('import { useState } from "react";', 'import { useState } from "react";\nimport { ArrowLeft, FileText, Search, X } from "lucide-react";')
need(
    "const iso = (d: Date) => todayStr(d);",
    '''const iso = (d: Date) => todayStr(d);

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
  { id: "birthdays", name: "Birthdays This Month", desc: "Members celebrating a birthday this month — send wishes on WhatsApp.", cat: "members", icon: Cake },
];
const CatTag = ({ cat }: { cat: Cat }) => (
  <span
    className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-black text-white"
    style={{ backgroundColor: CATS[cat].color }}
  >
    {CATS[cat].label}
  </span>
);''',
)
need('  const [tab, setTab] = useState("overview");', '  const [tab, setTab] = useState("");\n  const [search, setSearch] = useState("");\n  const [filterCat, setFilterCat] = useState<Cat | "all">("all");')

# header + active report bar replace Tabs
i = s.index("      <Tabs\n        value={tab}")
j = s.index("      {actions}\n") + len("      {actions}\n")
active = '''      <div className="mb-6">
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
'''
s = s[:i] + active + s[j:]

# close wrapper + catalog before </AppLayout>
catalog = '''          </div>
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
'''
k = s.rindex("    </AppLayout>\n")
s = s[:k] + catalog + s[k + len("    </AppLayout>\n"):]
io.open(p, "w", newline="", encoding="utf-8").write(s.replace("\n", "\r\n") if crlf else s)
print("ok")
