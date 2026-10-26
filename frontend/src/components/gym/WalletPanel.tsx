import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { Btn, Panel, fmtDate, inr } from "@/components/gym/kit";

// Member wallet: balance, history, manual credit and "pay this invoice from the wallet".
export default function WalletPanel({ member, invoices }: { member: any; invoices: any[] }) {
  const notify = useNotify();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["wallet", member._id], queryFn: async () => (await request<any>(`/wallet/${member._id}`)).data });
  const due = invoices.find((i) => ["pending", "partial"].includes(i.status) && i.totalAmount - i.paidAmount >= 1);
  const balance = q.data?.balance ?? 0;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      qc.invalidateQueries({ queryKey: ["wallet", member._id] });
      qc.invalidateQueries({ queryKey: ["member-overview", member._id] });
    } catch (e: any) {
      notify.error("Wallet", e.message);
    }
  };
  const post = (path: string, body: object) => request(`/wallet/${member._id}/${path}`, { method: "POST", body: JSON.stringify(body) });

  return (
    <Panel title={`Wallet · ${inr(balance)}`}>
      <div className="p-4 space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Btn
            light
            onClick={() => {
              const amount = Number(window.prompt("Amount to add to the wallet (Rs):"));
              const note = amount ? window.prompt("Reason (shown in history):") : "";
              if (amount && note) run(() => post("adjust", { amount, note }), "Wallet updated");
            }}
          >
            Add credit
          </Btn>
          {due && balance > 0 && (
            <Btn
              onClick={() => {
                const max = Math.min(balance, due.totalAmount - due.paidAmount);
                const amount = Number(window.prompt(`Pay invoice ${due.invoiceNumber} from the wallet (max ${max}):`, String(max)));
                if (amount) run(() => post("apply", { invoiceId: due._id, amount }), "Paid from wallet");
              }}
            >
              Pay invoice {due.invoiceNumber}
            </Btn>
          )}
        </div>
        {(q.data?.ledger || []).slice(0, 8).map((r: any) => (
          <div key={r._id} className="flex justify-between border-t border-black/10 pt-1.5 text-xs">
            <span>
              {fmtDate(r.createdAt)} · {r.reason}
              {r.note ? ` · ${r.note}` : ""}
            </span>
            <span className={r.amount < 0 ? "text-red-600 font-bold" : "text-green-700 font-bold"}>{r.amount > 0 ? "+" : ""}{inr(r.amount)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
