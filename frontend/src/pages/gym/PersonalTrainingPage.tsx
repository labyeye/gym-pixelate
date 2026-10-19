import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeIndianRupee,
  CalendarPlus,
  Check,
  Dumbbell,
  Plus,
  UserX,
  Users,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import {
  ActionButton,
  Btn,
  DataTable,
  Modal,
  Pill,
  RowActions,
  SelectInput,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  TextInput,
  Tr,
  fmtDate,
  fmtDateTime,
  inr,
} from "@/components/gym/kit";
import { MemberPicker, useTrainers } from "@/components/gym/pickers";

export default function PersonalTrainingPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const trainers = useTrainers();
  const [tab, setTab] = useState("packages");
  const [status, setStatus] = useState("active");
  const [sell, setSell] = useState(false);
  const [f, setF] = useState<any>({
    member: null,
    trainerId: "",
    name: "Personal Training",
    totalSessions: "12",
    pricePerSession: "",
    commissionPercent: "30",
    payNow: "",
    method: "cash",
  });
  const [open, setOpen] = useState<any>(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pt", status],
    queryFn: () => gym.pt.list({ status }),
  });
  const { data: comm } = useQuery({
    queryKey: ["pt-comm"],
    queryFn: () => gym.pt.commission(),
    enabled: tab === "commission",
  });
  const pkgs: any[] = data?.data || [];
  const cur = open ? pkgs.find((p) => p._id === open._id) || open : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["pt"] });

  const total =
    (Number(f.totalSessions) || 0) * (Number(f.pricePerSession) || 0);
  const totalWithGst = Math.round(total * 1.18 * 100) / 100;

  const create = async () => {
    try {
      setBusy(true);
      const r = await gym.pt.create({
        memberId: f.member._id,
        trainerId: f.trainerId,
        name: f.name,
        totalSessions: Number(f.totalSessions),
        pricePerSession: Number(f.pricePerSession),
        commissionPercent: Number(f.commissionPercent) || 0,
        payNow: f.payNow === "" ? totalWithGst : Number(f.payNow),
        method: f.method,
      });
      notify.success(
        "PT package sold",
        r.invoice
          ? `${r.invoice.invoiceNumber} · ${inr(r.invoice.totalAmount)}`
          : undefined,
      );
      setSell(false);
      refresh();
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      notify.error("Could not sell package", e.message);
    } finally {
      setBusy(false);
    }
  };
  const schedule = async () => {
    try {
      await gym.pt.schedule(cur._id, {
        scheduledAt: new Date(when).toISOString(),
      });
      notify.success("Session scheduled");
      setWhen("");
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  const mark = async (sid: string, status: string) => {
    try {
      await gym.pt.session(cur._id, sid, { status });
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <AppLayout title="Personal Training">
      <StatGrid>
        <StatCard
          label="Packages"
          value={data?.count ?? 0}
          sub={status}
          icon={Dumbbell}
          color="#024BAB"
        />
        <StatCard
          label="Sessions left"
          value={pkgs.reduce((s, p) => s + p.remainingSessions, 0)}
          icon={CalendarPlus}
          color="#A855F7"
        />
        <StatCard
          label="Revenue (these)"
          value={inr(pkgs.reduce((s, p) => s + p.totalAmount, 0))}
          icon={BadgeIndianRupee}
          color="#00C48C"
        />
        <StatCard
          label="Trainers"
          value={trainers.length}
          icon={Users}
          color="#FA731C"
        />
      </StatGrid>

      <div className="flex flex-wrap justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "packages", label: "Packages" },
            { id: "commission", label: "Trainer commission" },
          ]}
        />
        {tab === "packages" && (
          <div className="flex gap-2 mb-5">
            <select
              className="border-2 border-black px-3 py-2.5 text-sm font-bold bg-white"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["active", "completed", "expired", "cancelled", ""].map((s) => (
                <option key={s} value={s}>
                  {s || "all"}
                </option>
              ))}
            </select>
            {can("PersonalTraining", "create") && (
              <Btn onClick={() => setSell(true)}>
                <Plus className="w-4 h-4" /> Sell package
              </Btn>
            )}
          </div>
        )}
      </div>

      {tab === "packages" && (
        <DataTable
          head={[
            "Member",
            "Trainer",
            "Package",
            "Sessions",
            "Valid till",
            "Paid",
            "Status",
            "Actions",
          ]}
          loading={isLoading}
          empty={pkgs.length === 0}
        >
          {pkgs.map((p, i) => (
            <Tr key={p._id} i={i} onClick={() => setOpen(p)}>
              <Td>
                <p className="font-black">{p.memberId?.name}</p>
                <p className="text-xs text-black/50">
                  {p.memberId?.memberCode}
                </p>
              </Td>
              <Td className="font-bold">{p.trainerId?.name}</Td>
              <Td className="font-bold">{p.name}</Td>
              <Td>
                <span className="font-black">{p.remainingSessions}</span>
                <span className="text-black/50"> / {p.totalSessions} left</span>
              </Td>
              <Td className="text-xs font-bold">{fmtDate(p.validTill)}</Td>
              <Td className="font-bold">
                {inr(p.paidAmount)}
                <span className="text-black/40"> / {inr(p.totalAmount)}</span>
              </Td>
              <Td>
                <Pill value={p.status} />
              </Td>
              <Td>
                <RowActions>
                  <ActionButton
                    label="Sessions"
                    icon={CalendarPlus}
                    tone="primary"
                    onClick={() => setOpen(p)}
                  />
                </RowActions>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {tab === "commission" && (
        <DataTable
          head={[
            "Trainer",
            "Sessions delivered",
            "Revenue",
            "Commission payable",
          ]}
          empty={(comm?.data || []).length === 0}
        >
          {(comm?.data || []).map((r: any, i: number) => (
            <Tr key={r.trainerId} i={i}>
              <Td className="font-black">{r.trainer}</Td>
              <Td className="font-bold">{r.sessions}</Td>
              <Td className="font-bold">{inr(r.revenue)}</Td>
              <Td className="font-black text-[#00A070]">{inr(r.commission)}</Td>
            </Tr>
          ))}
        </DataTable>
      )}
      {tab === "commission" && (
        <p className="text-xs font-bold text-black/50 mt-2">
          This month, per completed session (not on the day of sale). Add
          ?from=&to= via the API for other periods.
        </p>
      )}

      <Modal
        open={sell}
        title="Sell PT package"
        onClose={() => setSell(false)}
        footer={
          <>
            <Btn light onClick={() => setSell(false)}>
              Cancel
            </Btn>
            <Btn
              busy={busy}
              disabled={!f.member || !f.trainerId || !(total > 0)}
              onClick={create}
            >
              Sell & bill
            </Btn>
          </>
        }
      >
        <MemberPicker
          value={f.member}
          onChange={(m) => setF({ ...f, member: m })}
          required
        />
        <SelectInput
          label="Trainer"
          required
          placeholder="Select trainer"
          options={trainers}
          value={f.trainerId}
          onChange={(v: string) => setF({ ...f, trainerId: v })}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Package name"
            value={f.name}
            onChange={(e: any) => setF({ ...f, name: e.target.value })}
          />
          <TextInput
            label="Sessions"
            type="number"
            min={1}
            value={f.totalSessions}
            onChange={(e: any) => setF({ ...f, totalSessions: e.target.value })}
          />
          <TextInput
            label="Price / session (₹)"
            type="number"
            min={0}
            value={f.pricePerSession}
            onChange={(e: any) =>
              setF({ ...f, pricePerSession: e.target.value })
            }
          />
          <TextInput
            label="Trainer commission %"
            type="number"
            min={0}
            max={100}
            value={f.commissionPercent}
            onChange={(e: any) =>
              setF({ ...f, commissionPercent: e.target.value })
            }
          />
          <TextInput
            label="Collect now (₹)"
            type="number"
            min={0}
            placeholder={String(totalWithGst)}
            value={f.payNow}
            onChange={(e: any) => setF({ ...f, payNow: e.target.value })}
            hint={`Total incl. 18% GST: ${inr(totalWithGst, 2)}`}
          />
          <SelectInput
            label="Method"
            options={["cash", "upi", "card", "online", "bank_transfer"]}
            value={f.method}
            onChange={(v: string) => setF({ ...f, method: v })}
          />
        </div>
      </Modal>

      <Modal
        open={!!cur}
        wide
        title={cur ? `${cur.memberId?.name} · ${cur.name}` : ""}
        subtitle={
          cur
            ? `${cur.trainerId?.name} · ${cur.remainingSessions}/${cur.totalSessions} sessions left`
            : undefined
        }
        onClose={() => setOpen(null)}
        footer={
          <Btn light onClick={() => setOpen(null)}>
            Close
          </Btn>
        }
      >
        {cur?.status === "active" && (
          <div className="flex flex-wrap items-end gap-3 border-2 border-black p-3 bg-[#024BAB]/5">
            <TextInput
              className="flex-1 min-w-[200px]"
              label="Schedule a session"
              type="datetime-local"
              value={when}
              onChange={(e: any) => setWhen(e.target.value)}
            />
            <Btn disabled={!when} onClick={schedule}>
              <CalendarPlus className="w-4 h-4" /> Schedule
            </Btn>
          </div>
        )}
        <ul className="divide-y divide-black/10">
          {(cur?.sessions || []).length === 0 && (
            <li className="py-3 text-xs font-bold uppercase text-black/40">
              No sessions booked yet
            </li>
          )}
          {(cur?.sessions || []).map((s: any, i: number) => (
            <li
              key={s._id}
              className="py-2 flex items-center justify-between gap-2"
            >
              <span className="font-bold text-sm">
                #{i + 1} · {fmtDateTime(s.scheduledAt)}{" "}
                <span className="text-black/50">({s.durationMin} min)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Pill value={s.status} />
                {s.status === "scheduled" && (
                  <>
                    <ActionButton
                      label="Completed"
                      icon={Check}
                      tone="primary"
                      onClick={() => mark(s._id, "completed")}
                    />
                    <ActionButton
                      label="Missed (counts as used)"
                      icon={UserX}
                      onClick={() => mark(s._id, "missed")}
                    />
                    <ActionButton
                      label="Cancel"
                      icon={X}
                      tone="danger"
                      onClick={() => mark(s._id, "cancelled")}
                    />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </AppLayout>
  );
}
