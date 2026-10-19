import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  DoorOpen,
  LogIn,
  LogOut,
  ScanFace,
  ShieldAlert,
  Users,
  XCircle,
  Clock,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { useAuth } from "@/contexts/AuthContext";
import {
  ActionButton,
  Btn,
  DataTable,
  Panel,
  Pill,
  RowActions,
  StatCard,
  StatGrid,
  Td,
  TextInput,
  Tr,
  fmtDateTime,
  inputCls,
  todayStr,
} from "@/components/gym/kit";
import { MemberPicker } from "@/components/gym/pickers";

const since = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function FrontDeskPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { user } = useAuth();
  const manager = user && ["gym_owner", "branch_manager"].includes(user.role);
  const [member, setMember] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(todayStr());

  const { data: live } = useQuery({
    queryKey: ["att-live"],
    queryFn: () => gym.attendance.live(),
    refetchInterval: 20_000,
  });
  const { data: log, isLoading } = useQuery({
    queryKey: ["att-log", day],
    queryFn: () =>
      gym.attendance.list({ startDate: day, endDate: day, limit: 100 }),
  });
  const L = live?.data || { insideCount: 0, todayCheckins: 0, inside: [] };

  useEffect(() => {
    setAccess(null);
    setReason("");
    if (member)
      gym.attendance
        .accessCheck({ memberId: member._id })
        .then((r) => setAccess(r.data))
        .catch((e) => notify.error("Check failed", e.message));
  }, [member]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["att-live"] });
    qc.invalidateQueries({ queryKey: ["att-log"] });
  };
  const checkin = async (override = false) => {
    try {
      setBusy(true);
      const r = await gym.attendance.checkin({
        memberId: member._id,
        method: "manual",
        ...(override ? { override: true, overrideReason: reason } : {}),
      });
      notify.success(
        "Checked in",
        [member.name, ...(r.warnings || [])].join(" · "),
      );
      setMember(null);
      refresh();
    } catch (e: any) {
      notify.error("Entry refused", e.message);
    } finally {
      setBusy(false);
    }
  };
  const checkout = async (id: string) => {
    try {
      await gym.attendance.checkout({ attendanceId: id });
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <AppLayout title="Front Desk">
      <StatGrid>
        <StatCard
          label="Inside now"
          value={L.insideCount}
          icon={DoorOpen}
          color="#00C48C"
        />
        <StatCard
          label="Check-ins today"
          value={L.todayCheckins}
          icon={Users}
          color="#024BAB"
        />
        <StatCard
          label="Longest inside"
          value={
            L.inside.length
              ? since(L.inside[L.inside.length - 1].checkinAt)
              : "—"
          }
          icon={Clock}
          color="#FA731C"
        />
        <Link to="/attendance/smart-entry">
          <StatCard
            label="Face kiosk"
            value="Open"
            icon={ScanFace}
            color="#A855F7"
            sub="camera check-in"
          />
        </Link>
      </StatGrid>

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <Panel title="Check a member in">
          <MemberPicker
            label="Find member"
            value={member}
            onChange={setMember}
          />
          {access && (
            <div
              className={`mt-4 border-2 border-black p-4 ${access.allowed ? "bg-[#00C48C]/20" : "bg-[#EF4444]/15"}`}
            >
              <div className="flex items-start gap-3">
                {access.allowed ? (
                  <CheckCircle2 className="w-8 h-8 text-[#00A070] shrink-0" />
                ) : (
                  <XCircle className="w-8 h-8 text-[#EF4444] shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-black text-lg">
                    {access.allowed ? "Welcome in" : "Entry blocked"}
                  </p>
                  <p className="text-sm font-bold">
                    {access.allowed
                      ? `${access.membership?.planName} · valid till ${new Date(access.membership.endDate).toLocaleDateString("en-IN")}`
                      : access.reason}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(access.warnings || []).map((w: string) => (
                      <span key={w} className="nb-badge nb-tag-orange">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-end">
                {access.allowed && (
                  <Btn color="#00A070" busy={busy} onClick={() => checkin()}>
                    <LogIn className="w-4 h-4" /> Check in
                  </Btn>
                )}
                {!access.allowed && access.overridable && manager && (
                  <>
                    <TextInput
                      className="flex-1 min-w-[180px]"
                      label="Override reason"
                      value={reason}
                      onChange={(e: any) => setReason(e.target.value)}
                      placeholder="Why are you letting them in?"
                    />
                    <Btn
                      color="#FA731C"
                      busy={busy}
                      disabled={!reason.trim()}
                      onClick={() => checkin(true)}
                    >
                      <ShieldAlert className="w-4 h-4" /> Let in anyway
                    </Btn>
                  </>
                )}
                {!access.allowed && access.overridable && !manager && (
                  <p className="text-xs font-bold text-black/60">
                    Ask a manager to approve entry.
                  </p>
                )}
                <Link
                  to={`/members/${member?._id}`}
                  className="text-xs font-black uppercase underline ml-auto"
                >
                  Open profile →
                </Link>
              </div>
            </div>
          )}
        </Panel>

        <Panel title={`Inside now (${L.insideCount})`}>
          {L.inside.length === 0 ? (
            <p className="text-xs font-bold text-black/40 uppercase">
              Nobody inside
            </p>
          ) : (
            <ul className="nb-list divide-y divide-black/10 max-h-72 overflow-y-auto">
              {L.inside.map((a: any) => (
                <li
                  key={a._id}
                  className="py-2 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-black truncate">{a.memberId?.name}</p>
                    <p className="text-xs text-black/50 font-bold">
                      {a.memberId?.memberCode} · in for {since(a.checkinAt)}
                    </p>
                  </div>
                  <ActionButton
                    label="Check out"
                    icon={LogOut}
                    onClick={() => checkout(a._id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-black uppercase tracking-widest">
          Visit log
        </h3>
        <input
          type="date"
          className={inputCls + " !w-44"}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>
      <DataTable
        head={[
          "Member",
          "Check-in",
          "Check-out",
          "Duration",
          "Method",
          "Actions",
        ]}
        loading={isLoading}
        empty={(log?.data || []).length === 0}
      >
        {(log?.data || []).map((a: any, i: number) => (
          <Tr key={a._id} i={i}>
            <Td>
              <p className="font-black">{a.memberId?.name}</p>
              <p className="text-xs text-black/50">{a.memberId?.memberCode}</p>
            </Td>
            <Td className="font-bold text-xs">{fmtDateTime(a.checkinAt)}</Td>
            <Td className="text-xs font-bold">
              {a.checkoutAt ? (
                fmtDateTime(a.checkoutAt)
              ) : (
                <span className="nb-badge nb-tag-green">Inside</span>
              )}
            </Td>
            <Td>
              {a.durationMin
                ? `${a.durationMin} min${a.autoCheckout ? " (auto)" : ""}`
                : "—"}
            </Td>
            <Td>
              <Pill value={a.method} className="nb-tag-white" />
              {a.overrideReason && (
                <p className="text-[10px] font-bold text-[#FA731C] mt-1">
                  Override: {a.overrideReason}
                </p>
              )}
            </Td>
            <Td>
              <RowActions>
                {!a.checkoutAt && (
                  <ActionButton
                    label="Check out"
                    icon={LogOut}
                    onClick={() => checkout(a._id)}
                  />
                )}
              </RowActions>
            </Td>
          </Tr>
        ))}
      </DataTable>
    </AppLayout>
  );
}
