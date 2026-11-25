import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { downloadPdf } from "@/components/gym/printInvoice";
import { useNotify } from "@/components/ui/Notification";
import { ActionButton, DataTable, Td, Tr, inr } from "@/components/gym/kit";
import { ExportImport } from "@/components/gym/ExportImport";

// Monthly payroll: pro-rata salary by attendance + trainer PT commission. Each row downloads a salary slip
// printed on the payroll cheque PDF (backend/assets/payrollcheque.pdf).
export default function PayrollPage() {
  const notify = useNotify();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [mode, setMode] = useState<"bank" | "cash">("bank");
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", month],
    queryFn: () => gym.payroll({ month }),
  });
  const rows: any[] = data?.data || [];

  return (
    <AppLayout title="Payroll">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-xs font-black uppercase">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="block border-2 border-black px-3 py-2 text-sm font-bold bg-white"
          />
        </label>
        <label className="text-xs font-black uppercase">
          Mode of payment on slip
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="block border-2 border-black px-3 py-2 text-sm font-bold bg-white"
          >
            <option value="bank">UPI / Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <ExportImport
          name={`payroll_${month}`}
          rows={rows}
          cols={[
            { header: "Name", value: (r: any) => r.name },
            { header: "Role", value: (r: any) => r.role },
            { header: "Monthly salary", value: (r: any) => r.monthlySalary },
            { header: "Payable days", value: (r: any) => r.payableDays },
            { header: "Days in month", value: (r: any) => r.daysInMonth },
            { header: "Base pay", value: (r: any) => r.basePay },
            { header: "PT sessions", value: (r: any) => r.ptSessions },
            { header: "PT commission", value: (r: any) => r.commission },
            { header: "Total", value: (r: any) => r.total },
          ]}
        />
        <p className="text-xs font-bold text-black/60 ml-auto">
          Total payable: {inr(data?.totals?.total || 0)}
        </p>
      </div>
      <DataTable
        head={[
          "Name",
          "Role",
          "Monthly salary",
          "Payable days",
          "Base pay",
          "PT commission",
          "Total",
          "Slip",
        ]}
        loading={isLoading}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <Tr key={r.userId}>
            <Td>
              <span className="font-black">{r.name}</span>
              {r.unmarkedDays > 0 && (
                <p className="text-[11px] text-black/50">
                  {r.unmarkedDays} days not marked
                </p>
              )}
            </Td>
            <Td className="capitalize">{String(r.role).replace("_", " ")}</Td>
            <Td>{inr(r.monthlySalary)}</Td>
            <Td>
              {r.payableDays} / {r.daysInMonth}
            </Td>
            <Td>{inr(r.basePay)}</Td>
            <Td>
              {inr(r.commission)}
              {r.ptSessions > 0 && (
                <p className="text-[11px] text-black/50">
                  {r.ptSessions} sessions
                </p>
              )}
            </Td>
            <Td className="font-black">{inr(r.total)}</Td>
            <Td>
              <ActionButton
                icon={Download}
                label="Download salary slip"
                onClick={() =>
                  downloadPdf(
                    `/payroll/slip?userId=${r.userId}&month=${month}&mode=${mode}`,
                    `Salary_${String(r.name).replace(/[^\w-]/g, "_")}_${month}.pdf`,
                  ).catch((e: any) => notify.error("Slip failed", e.message))
                }
              />
            </Td>
          </Tr>
        ))}
      </DataTable>
    </AppLayout>
  );
}
