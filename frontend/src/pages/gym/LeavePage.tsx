import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, CheckCircle, Clock, Pencil, Plus, Settings2, XCircle, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Btn, Modal, SelectInput, StatCard, TextArea, TextInput } from "@/components/gym/kit";

// Leave Management for trainers and staff, laid out like NestHR's Leave page: apply, balances, filter, approve / reject /
// edit / cancel with the same prompts. Allowances are yearly and set here by the owner. No payroll deduction.
const TYPE_LABEL: Record<string, string> = { casual: "Casual", sick: "Sick", earned: "Earned", maternity: "Maternity", paternity: "Paternity", compensatory: "Compensatory", unpaid: "Unpaid" };
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-[#FA731C]/10 text-[#FA731C] border-[#FA731C]",
  approved: "bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]",
  rejected: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]",
  cancelled: "bg-gray-100 text-gray-500 border-gray-300",
};
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateOnly = (d: string) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const blank = { id: "", userId: "", leaveType: "casual", startDate: today(), endDate: today(), reason: "", isHalfDay: false, halfDayType: "first_half" };

export default function LeavePage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const { user } = useAuth();
  const manager = can("Staff", "update");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [approve, setApprove] = useState<any>(null);
  const [reject, setReject] = useState<{ id: string; reason: string } | null>(null);
  const [cancel, setCancel] = useState<{ id: string; reason: string; approved: boolean } | null>(null);
  const [allowOpen, setAllowOpen] = useState(false);
  const [allow, setAllow] = useState<Record<string, string>>({});

  const leaves = useQuery({ queryKey: ["staff-leaves"], queryFn: async () => (await gym.staffHr.leaves()).data as any[] });
  const info = useQuery({ queryKey: ["leave-allowance"], queryFn: async () => (await gym.staffHr.allowance()).data });
  const staff = useQuery({
    queryKey: ["leave-staff"],
    enabled: manager,
    queryFn: async () => ((await gym.users.list()).data as any[]).filter((u) => !["member", "gym_owner", "super_admin"].includes(u.role) && u.status !== "inactive"),
  });

  const refresh = () => ["staff-leaves", "leave-allowance", "staff-me", "staff-records"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (fn: () => Promise<any>, done: string) => {
    setBusy(true);
    try {
      await fn();
      notify.success(done);
      refresh();
      return true;
    } catch (e: any) {
      notify.error("Failed", e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const all = leaves.data || [];
  const list = filter ? all.filter((l) => l.status === filter) : all;
  const count = (s: string) => all.filter((l) => l.status === s).length;
  const balance = info.data?.balance || {};
  const isMe = (l: any) => String(l.userId?._id) === String(user?.id);
  const canEdit = (l: any) => l.status === "pending" && (isMe(l) || manager);
  const types = useMemo(() => (info.data?.types as string[]) || Object.keys(TYPE_LABEL), [info.data]);
  // types with no days left are hidden for apply (except unpaid) so people don't hit the limit error
  const applyTypes = types.filter((t) => t === "unpaid" || (info.data?.allowance?.[t] ?? 0) > 0);

  const submit = async () => {
    if (!form) return;
    const body = { ...form, userId: form.userId || undefined };
    const ok = await run(() => (form.id ? gym.staffHr.editLeave(form.id, body) : gym.staffHr.requestLeave(body)), form.id ? "Leave updated" : "Leave requested");
    if (ok) setForm(null);
  };
  const openEdit = (l: any) => setForm({ id: l._id, userId: "", leaveType: l.leaveType, startDate: dateOnly(l.startDate), endDate: dateOnly(l.endDate), reason: l.reason, isHalfDay: !!l.isHalfDay, halfDayType: l.halfDayType || "first_half" });

  return (
    <AppLayout title="Leave Management">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border-2 border-black px-3 py-2 text-sm font-semibold outline-none bg-white">
          <option value="">All requests</option>
          {["pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <div className="flex gap-2">
          {manager && (
            <button onClick={() => { setAllow(Object.fromEntries(Object.entries(info.data?.allowance || {}).map(([k, v]) => [k, String(v)]))); setAllowOpen(true); }} className="border-2 bg-white text-[#024BAB] px-4 py-2 text-sm flex items-center gap-1.5">
              <Settings2 className="w-4 h-4" /> Leave allowance
            </button>
          )}
          <button onClick={() => setForm({ ...blank, leaveType: applyTypes[0] || "unpaid" })} className="border-2 bg-[#024BAB] text-white px-4 py-2 text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Apply Leave
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3 mb-5">
        <StatCard label="Pending" value={count("pending")} icon={Clock} color="#FA731C" active={filter === "pending"} onClick={() => setFilter(filter === "pending" ? "" : "pending")} />
        <StatCard label="Approved" value={count("approved")} icon={CheckCircle} color="#00C48C" active={filter === "approved"} onClick={() => setFilter(filter === "approved" ? "" : "approved")} />
        <StatCard label="Rejected" value={count("rejected")} icon={XCircle} color="#EF4444" active={filter === "rejected"} onClick={() => setFilter(filter === "rejected" ? "" : "rejected")} />
        <StatCard label="Cancelled" value={count("cancelled")} icon={Ban} color="#6B7280" active={filter === "cancelled"} onClick={() => setFilter(filter === "cancelled" ? "" : "cancelled")} />
      </div>

      <div className="mb-5 border-2 border-black bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#024BAB] mb-2">My leave balance this year</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {Object.entries(balance).filter(([, b]: any) => b.total > 0).map(([t, b]: any) => (
            <div key={t} className="border-2 border-black p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500">{TYPE_LABEL[t] || t}</p>
              <p className="text-xl font-bold text-[#024BAB]">{b.left}<span className="text-sm text-gray-500">/{b.total}</span></p>
              <p className="text-[10px] text-gray-500">{b.used} used or pending</p>
            </div>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="border-2 bg-white p-12 flex flex-col items-center justify-center">
          <Clock className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-bold text-black">No leave requests</p>
        </div>
      ) : (
        <div className="border-2 bg-white overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black bg-[#024BAB]/5">
                {["Name", "Type", "Dates", "Days", "Reason", "Status", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((l: any, i: number) => (
                <tr key={l._id} className={cn("border-b border-black/10 hover:bg-[#024BAB]/5", i % 2 ? "bg-[#F8FAFF]" : "")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-[#024BAB] border-2 border-black flex items-center justify-center text-[10px] font-bold text-white rounded-full">{l.userId?.name?.[0]?.toUpperCase()}</div>
                      <div>
                        <p className="font-bold text-black text-xs">{l.userId?.name || "-"}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{l.userId?.role?.replace("_", " ")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{TYPE_LABEL[l.leaveType] || l.leaveType}{l.status === "approved" && <span className="ml-1 text-[10px] text-gray-500">({l.paid ? "paid" : "unpaid"})</span>}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{l.days > 1 ? `${fmt(l.startDate)} - ${fmt(l.endDate)}` : fmt(l.startDate)}{l.isHalfDay && <span className="block text-[10px] text-gray-500">{l.halfDayType === "second_half" ? "second half" : "first half"}</span>}</td>
                  <td className="px-4 py-3 text-xs">{l.days}</td>
                  <td className="px-4 py-3 text-xs max-w-[220px]">{l.reason}{l.rejectionReason ? <span className="block text-[#EF4444]">Rejected: {l.rejectionReason}</span> : null}{l.cancellationReason ? <span className="block text-gray-500">Cancelled: {l.cancellationReason}</span> : null}</td>
                  <td className="px-4 py-3"><span className={cn("border-2 text-[10px] capitalize px-2 py-0.5 w-fit block", STATUS_COLORS[l.status])}>{l.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {l.status === "pending" && manager && !isMe(l) && (
                        <>
                          <button title="Approve" onClick={() => setApprove({ id: l._id, name: l.userId?.name, type: l.leaveType, days: l.days, paid: l.leaveType !== "unpaid" })} className="p-1.5 border-2 border-black hover:bg-[#00C48C] hover:text-white"><Check className="w-3.5 h-3.5" /></button>
                          <button title="Reject" onClick={() => setReject({ id: l._id, reason: "" })} className="p-1.5 border-2 border-black hover:bg-[#EF4444] hover:text-white"><X className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                      {canEdit(l) && <button title="Edit" onClick={() => openEdit(l)} className="p-1.5 border-2 border-black hover:bg-[#024BAB] hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>}
                      {((l.status === "pending" && (isMe(l) || manager)) || (l.status === "approved" && manager)) && (
                        <button title="Cancel leave" onClick={() => setCancel({ id: l._id, reason: "", approved: l.status === "approved" })} className="p-1.5 border-2 border-black hover:bg-gray-200"><Ban className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!form} title={form?.id ? "Edit Leave" : "Apply Leave"} onClose={() => setForm(null)} footer={<><Btn light onClick={() => setForm(null)}>Cancel</Btn><Btn busy={busy} disabled={!form?.reason.trim()} onClick={submit}>{form?.id ? "Save" : "Send request"}</Btn></>}>
        {form && (
          <>
            {manager && !form.id && (
              <SelectInput label="For" placeholder="Myself" options={(staff.data || []).map((u: any) => ({ value: u._id, label: `${u.name} (${u.role.replace("_", " ")})` }))} value={form.userId} onChange={(v: string) => setForm({ ...form, userId: v })} />
            )}
            <SelectInput label="Leave type" options={(form.id ? types : applyTypes).map((t) => ({ value: t, label: TYPE_LABEL[t] || t }))} value={form.leaveType} onChange={(v: string) => setForm({ ...form, leaveType: v })} />
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={form.isHalfDay} onChange={(e) => setForm({ ...form, isHalfDay: e.target.checked, endDate: e.target.checked ? form.startDate : form.endDate })} /> Half day
            </label>
            {form.isHalfDay && <SelectInput label="Which half" options={[{ value: "first_half", label: "First half" }, { value: "second_half", label: "Second half" }]} value={form.halfDayType} onChange={(v: string) => setForm({ ...form, halfDayType: v })} />}
            <TextInput label="From" type="date" value={form.startDate} onChange={(e: any) => setForm({ ...form, startDate: e.target.value, endDate: form.isHalfDay || e.target.value > form.endDate ? e.target.value : form.endDate })} />
            {!form.isHalfDay && <TextInput label="To" type="date" min={form.startDate} value={form.endDate} onChange={(e: any) => setForm({ ...form, endDate: e.target.value })} />}
            <TextArea label="Reason" value={form.reason} onChange={(e: any) => setForm({ ...form, reason: e.target.value })} />
          </>
        )}
      </Modal>

      <Modal open={!!approve} title="Approve Leave" onClose={() => setApprove(null)} footer={<><Btn light onClick={() => setApprove(null)}>Cancel</Btn><Btn busy={busy} onClick={async () => { if (await run(() => gym.staffHr.decide(approve.id, { status: "approved", paid: approve.paid }), "Approved")) setApprove(null); }}>Approve</Btn></>}>
        {approve && (
          <>
            <p className="text-sm"><b>{approve.name}</b> · {TYPE_LABEL[approve.type]} leave · {approve.days} day{approve.days === 1 ? "" : "s"}</p>
            {approve.type === "unpaid" ? (
              <p className="text-xs text-gray-600">Unpaid leave is marked as unpaid on the attendance sheet.</p>
            ) : (
              <div className="flex gap-3">
                <button type="button" onClick={() => setApprove({ ...approve, paid: true })} className={cn("flex-1 py-3 border-2 border-black text-sm font-bold", approve.paid ? "bg-[#024BAB] text-white" : "bg-white")}>Paid leave</button>
                <button type="button" onClick={() => setApprove({ ...approve, paid: false })} className={cn("flex-1 py-3 border-2 border-black text-sm font-bold", !approve.paid ? "bg-[#024BAB] text-white" : "bg-white")}>Unpaid (deduct)</button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!reject} title="Reject Leave" onClose={() => setReject(null)} footer={<><Btn light onClick={() => setReject(null)}>Cancel</Btn><Btn busy={busy} disabled={!reject?.reason.trim()} onClick={async () => { if (await run(() => gym.staffHr.decide(reject!.id, { status: "rejected", rejectionReason: reject!.reason }), "Rejected")) setReject(null); }}>Reject</Btn></>}>
        {reject && <TextArea label="Reason for rejecting" value={reject.reason} onChange={(e: any) => setReject({ ...reject, reason: e.target.value })} />}
      </Modal>

      <Modal open={!!cancel} title="Cancel Leave" onClose={() => setCancel(null)} footer={<><Btn light onClick={() => setCancel(null)}>Back</Btn><Btn busy={busy} disabled={!!cancel?.approved && !cancel?.reason.trim()} onClick={async () => { if (await run(() => gym.staffHr.cancelLeave(cancel!.id, cancel!.reason), "Leave cancelled")) setCancel(null); }}>Cancel leave</Btn></>}>
        {cancel && (
          <>
            {cancel.approved && <p className="text-xs text-gray-600">This leave is approved. Cancelling it removes the leave days from the attendance sheet.</p>}
            <TextArea label={cancel.approved ? "Reason (required)" : "Reason (optional)"} value={cancel.reason} onChange={(e: any) => setCancel({ ...cancel, reason: e.target.value })} />
          </>
        )}
      </Modal>

      <Modal open={allowOpen} title="Leave allowance (days per year)" onClose={() => setAllowOpen(false)} footer={<><Btn light onClick={() => setAllowOpen(false)}>Cancel</Btn><Btn busy={busy} onClick={async () => { if (await run(() => gym.staffHr.setAllowance(allow), "Allowance saved")) setAllowOpen(false); }}>Save</Btn></>}>
        <p className="text-xs text-gray-600">The same for every trainer and staff member. 0 means that type is not offered. Unpaid leave is always available.</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.keys(allow).map((t) => (
            <TextInput key={t} label={TYPE_LABEL[t] || t} type="number" min={0} max={365} step={0.5} value={allow[t]} onChange={(e: any) => setAllow({ ...allow, [t]: e.target.value })} />
          ))}
        </div>
      </Modal>
    </AppLayout>
  );
}
