import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  Download,
  IndianRupee,
  Save,
  UserCheck,
  Users,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { request, usersAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  Btn,
  DataTable,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  Tr,
  inputCls,
  inr,
  titleCase,
  todayStr,
} from "@/components/gym/kit";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { short: string; cls: string; label: string }> = {
  present: { short: "P", cls: "bg-[#00C48C] text-black", label: "Present" },
  half_day: { short: "½", cls: "bg-[#A3E635] text-black", label: "Half day" },
  paid_leave: {
    short: "PL",
    cls: "bg-[#0EA5E9] text-white",
    label: "Paid leave",
  },
  unpaid_leave: {
    short: "UL",
    cls: "bg-[#FA731C] text-white",
    label: "Unpaid leave",
  },
  absent: { short: "A", cls: "bg-[#EF4444] text-white", label: "Absent" },
  weekly_off: {
    short: "WO",
    cls: "bg-[#A855F7] text-white",
    label: "Weekly off",
  },
  holiday: { short: "H", cls: "bg-[#0D9488] text-white", label: "Holiday" },
};
const ORDER = [
  "present",
  "half_day",
  "paid_leave",
  "unpaid_leave",
  "absent",
  "weekly_off",
  "holiday",
];
const csv = (name: string, rows: any[][]) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(
      [
        rows
          .map((r) =>
            r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    ),
  );
  a.download = name;
  a.click();
};

export default function StaffPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [tab, setTab] = useState("attendance");
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [salary, setSalary] = useState<Record<string, string>>({});

  const grid = useQuery({
    queryKey: ["staff-month", month],
    queryFn: () => request<any>(`/staff-attendance?month=${month}`),
  });
  const pay = useQuery({
    queryKey: ["payroll", month],
    queryFn: () => request<any>(`/payroll?month=${month}`),
    enabled: tab === "payroll",
  });
  const days: number = grid.data?.days || 30;
  const staff: any[] = grid.data?.data || [];
  const today = todayStr();

  const mark = async (
    userId: string,
    d: number,
    current?: string,
    forced?: string,
  ) => {
    const status =
      forced || ORDER[(ORDER.indexOf(current || "") + 1) % ORDER.length];
    try {
      await request<any>("/staff-attendance", {
        method: "POST",
        body: JSON.stringify({
          userId,
          date: `${month}-${String(d).padStart(2, "0")}`,
          status,
        }),
      });
      qc.invalidateQueries({ queryKey: ["staff-month"] });
      qc.invalidateQueries({ queryKey: ["payroll"] });
    } catch (e: any) {
      notify.error("Could not mark", e.message);
    }
  };
  const markAll = async (status: string) => {
    const d = Number(today.slice(8));
    if (today.slice(0, 7) !== month)
      return notify.error("Switch to the current month first");
    await Promise.all(
      staff
        .filter((s) => !s.marks[d])
        .map((s) =>
          request<any>("/staff-attendance", {
            method: "POST",
            body: JSON.stringify({ userId: s._id, date: today, status }),
          }),
        ),
    );
    qc.invalidateQueries({ queryKey: ["staff-month"] });
    notify.success(
      "Marked",
      `Unmarked staff set to ${STATUS[status].label.toLowerCase()} for today`,
    );
  };
  const saveSalary = async (id: string) => {
    try {
      await usersAPI.update(id, { monthlySalary: Number(salary[id]) || 0 });
      notify.success("Salary saved");
      qc.invalidateQueries({ queryKey: ["staff-month"] });
      qc.invalidateQueries({ queryKey: ["payroll"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  const presentToday = staff.filter((s) =>
    ["present", "half_day"].includes(s.marks[Number(today.slice(8))]),
  ).length;

  return (
    <AppLayout title="Staff & Payroll">
      <StatGrid>
        <StatCard
          label="Staff"
          value={staff.length}
          icon={Users}
          color="#024BAB"
        />
        <StatCard
          label="Present today"
          value={presentToday}
          icon={UserCheck}
          color="#00C48C"
        />
        <StatCard
          label="Payroll (this sheet)"
          value={inr(pay.data?.totals?.total)}
          icon={IndianRupee}
          color="#A855F7"
          sub="base + PT commission"
        />
        <StatCard
          label="Month"
          value={month}
          icon={CalendarCheck}
          color="#FA731C"
        />
      </StatGrid>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "attendance", label: "Attendance" },
            { id: "payroll", label: "Payroll" },
          ]}
        />
        <div className="flex gap-2 mb-5">
          <input
            type="month"
            className={inputCls + " !w-44"}
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          {tab === "attendance" && can("Staff", "update") && (
            <Btn light onClick={() => markAll("present")}>
              Mark rest present today
            </Btn>
          )}
        </div>
      </div>

      {tab === "attendance" && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {ORDER.map((k) => (
              <span key={k} className={cn("nb-badge", STATUS[k].cls)}>
                {STATUS[k].short} · {STATUS[k].label}
              </span>
            ))}
          </div>
          <div className="border-2 border-black bg-white overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="bg-[#024BAB] text-white">
                  <th className="text-left px-3 py-2 sticky left-0 bg-[#024BAB] min-w-[150px] uppercase tracking-widest text-[10px]">
                    Staff
                  </th>
                  {Array.from({ length: days }, (_, i) => (
                    <th key={i} className="w-8 text-center py-2 font-black">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s._id} className="border-t-2 border-black">
                    <td className="px-3 py-1.5 sticky left-0 bg-white font-black">
                      <p>{s.name}</p>
                      <p className="text-[10px] font-bold uppercase text-black/40">
                        {titleCase(s.role)}
                      </p>
                    </td>
                    {Array.from({ length: days }, (_, i) => {
                      const st = s.marks[i + 1];
                      return (
                        <td key={i} className="p-0.5">
                          <button
                            disabled={!can("Staff", "update")}
                            title={
                              st
                                ? STATUS[st].label
                                : "Not marked — click to mark"
                            }
                            onClick={() => mark(s._id, i + 1, st)}
                            className={cn(
                              "w-7 h-7 border border-black/20 text-[10px] font-black transition hover:scale-110",
                              st ? STATUS[st].cls : "bg-white text-black/20",
                            )}
                          >
                            {st ? STATUS[st].short : "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td
                      className="p-8 text-center font-black uppercase tracking-widest text-black/30"
                      colSpan={days + 1}
                    >
                      No staff accounts yet — add them in Settings → Users /
                      Staff.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs font-bold text-black/50 mt-2">
            Click a day to cycle through statuses. Unmarked days are unpaid in
            the payroll sheet.
          </p>
        </>
      )}

      {tab === "payroll" && (
        <>
          <DataTable
            head={[
              "Staff",
              "Salary / month",
              "Present",
              "Half",
              "Leave (paid/unpaid)",
              "Absent",
              "Unmarked",
              "Payable days",
              "Base pay",
              "PT commission",
              "Total",
            ]}
            loading={pay.isLoading}
            empty={!(pay.data?.data || []).length}
          >
            {(pay.data?.data || []).map((r: any, i: number) => (
              <Tr key={r.userId} i={i}>
                <Td>
                  <p className="font-black">{r.name}</p>
                  <p className="text-[10px] font-bold uppercase text-black/40">
                    {titleCase(r.role)}
                  </p>
                </Td>
                <Td>
                  <div className="flex gap-1 items-center">
                    <input
                      type="number"
                      min={0}
                      className={inputCls + " !w-24"}
                      value={salary[r.userId] ?? r.monthlySalary}
                      onChange={(e) =>
                        setSalary({ ...salary, [r.userId]: e.target.value })
                      }
                    />
                    {salary[r.userId] !== undefined &&
                      salary[r.userId] !== String(r.monthlySalary) &&
                      can("Staff", "update") && (
                        <button
                          aria-label="Save salary"
                          onClick={() => saveSalary(r.userId)}
                          className="w-8 h-8 border-2 border-black bg-[#00C48C] flex items-center justify-center"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      )}
                  </div>
                </Td>
                <Td>{r.present}</Td>
                <Td>{r.halfDays}</Td>
                <Td>
                  {r.paidLeave} / {r.unpaidLeave}
                </Td>
                <Td className={r.absent ? "text-red-600 font-black" : ""}>
                  {r.absent}
                </Td>
                <Td
                  className={r.unmarkedDays ? "text-[#FA731C] font-black" : ""}
                >
                  {r.unmarkedDays}
                </Td>
                <Td className="font-bold">
                  {r.payableDays} / {r.daysInMonth}
                </Td>
                <Td className="font-bold">{inr(r.basePay)}</Td>
                <Td>
                  {r.ptSessions ? (
                    <span className="font-bold">
                      {inr(r.commission)}{" "}
                      <span className="text-black/40 text-xs">
                        ({r.ptSessions} sessions)
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="font-black text-[#00A070]">{inr(r.total)}</Td>
              </Tr>
            ))}
          </DataTable>
          {(pay.data?.data || []).length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
              <p className="font-black">
                Total payable: {inr(pay.data?.totals?.total)}{" "}
                <span className="text-black/50 text-xs font-bold">
                  (base {inr(pay.data?.totals?.basePay)} + commission{" "}
                  {inr(pay.data?.totals?.commission)})
                </span>
              </p>
              <Btn
                light
                onClick={() =>
                  csv(`payroll-${month}.csv`, [
                    [
                      "Staff",
                      "Role",
                      "Salary",
                      "Payable days",
                      "Base pay",
                      "PT sessions",
                      "Commission",
                      "Total",
                    ],
                    ...pay.data.data.map((r: any) => [
                      r.name,
                      r.role,
                      r.monthlySalary,
                      r.payableDays,
                      r.basePay,
                      r.ptSessions,
                      r.commission,
                      r.total,
                    ]),
                  ])
                }
              >
                <Download className="w-4 h-4" /> Export CSV
              </Btn>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
