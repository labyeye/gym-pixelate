import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  AlertCircle,
  CalendarOff,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Fingerprint,
  LogIn,
  LogOut,
  MapPin,
  MousePointerClick,
  Palmtree,
  Scan,
  ScanFace,
  Timer,
  UserCheck,
  UserX,
  Users,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import { moduleOn } from "@/config/modules";
import { cn } from "@/lib/utils";
import { Btn, Modal, SelectInput, StatCard, TextInput } from "@/components/gym/kit";
import { MemberPicker } from "@/components/gym/pickers";
import FaceCapture from "@/components/attendance/FaceCapture";
import FaceKioskModal from "@/components/attendance/FaceKioskModal";
import AttendanceProfileFields, { emptyProfile, profileOf, saveProfile } from "@/components/attendance/AttendanceProfileFields";

// Same layout as NestHR's Attendance page: month picker + action buttons, clickable stat cards, a date strip with P/A counts,
// a "no record" banner with Mark All Absent, then the table. Pick a day and everyone who has not checked in shows up as
// "Not checked in" (or "Weekly off" on their off days). One page for trainers, staff and members; each group is optional
// (Settings > Modules). Leave lives on its own page. No payroll here.
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STRIP = 7;
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

const STATUS_COLORS: Record<string, string> = {
  present: "bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]",
  late: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]",
  absent: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]",
  half_day: "bg-[#FA731C]/10 text-[#FA731C] border-[#FA731C]",
  paid_leave: "bg-[#024BAB]/10 text-[#024BAB] border-[#024BAB]",
  unpaid_leave: "bg-[#024BAB]/10 text-[#024BAB] border-[#024BAB]",
  weekly_off: "bg-gray-100 text-gray-500 border-gray-300",
  weekend: "bg-gray-100 text-gray-500 border-gray-300",
  holiday: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]",
  inside: "bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]",
  done: "bg-gray-100 text-gray-500 border-gray-300",
  not_checked_in: "bg-gray-100 text-gray-500 border-gray-300",
};
const STATUS_LABEL: Record<string, string> = { inside: "Inside", done: "Checked out", weekend: "Weekly off", not_checked_in: "Not checked in" };
const STATUS_ICONS: Record<string, React.ElementType> = { present: CheckCircle, late: Clock, absent: XCircle, half_day: AlertCircle, paid_leave: Palmtree, unpaid_leave: Palmtree, inside: CheckCircle, not_checked_in: Clock };

const VIA: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  biometric: { label: "Device", icon: Fingerprint, cls: "bg-[#024BAB]/10 text-[#024BAB] border-[#024BAB]" },
  face: { label: "Face", icon: Scan, cls: "bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]" },
  geo_camera: { label: "Face + GPS", icon: Scan, cls: "bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]" },
  geo: { label: "GPS", icon: MapPin, cls: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]" },
  self: { label: "Self", icon: MousePointerClick, cls: "bg-[#FA731C]/10 text-[#FA731C] border-[#FA731C]" },
  manual: { label: "Manual", icon: MousePointerClick, cls: "bg-gray-100 text-gray-500 border-gray-300" },
};
const getPos = () =>
  new Promise<{ lat: number; lng: number; accuracy: number }>((res, rej) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => rej(new Error("Allow location access to check in")),
          { enableHighAccuracy: true, timeout: 15000 },
        )
      : rej(new Error("Location is not supported on this device")),
  );

const TABS = [
  { key: "trainer", label: "Trainers", mod: "trainerAttendance" },
  { key: "staff", label: "Staff", mod: "staffAttendance" },
  { key: "member", label: "Members", mod: "memberAttendance" },
];

type Row = { id: string; who: string; whoId: string; sub?: string; date: string; checkIn?: string; checkOut?: string; hours: number; status: string; via?: string; virtual?: boolean; loc?: { lat: number; lng: number; distanceMeters?: number } };

export default function StaffAttendancePage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermission();
  const { user, modules } = useAuth();
  const manager = can("Staff", "update"); // owner / branch manager
  const desk = ["gym_owner", "branch_manager", "receptionist"].includes(user?.role || "");
  const isOwner = user?.role === "gym_owner";
  const mineKey = user?.role === "trainer" ? "trainerAttendance" : "staffAttendance";
  const selfOn = !isOwner && moduleOn(modules, mineKey);

  const tabs = TABS.filter((t) => moduleOn(modules, t.mod) && (t.key === "member" ? desk : manager));
  const [tab, setTab] = useState("");
  const cur = tabs.find((t) => t.key === tab)?.key || tabs[0]?.key;
  const isMember = cur === "member";
  const isSheet = cur === "staff" || cur === "trainer";

  const todayIso = istToday();
  const [year, setYear] = useState(Number(todayIso.slice(0, 4)));
  const [month, setMonth] = useState(Number(todayIso.slice(5, 7)));
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(() => Math.max(1, Math.min(Number(todayIso.slice(8)) - 3, 32 - STRIP)));
  // opening a tab or month shows today (current month) so "not checked in" is visible straight away
  useEffect(() => {
    setSelectedDate(monthKey === todayIso.slice(0, 7) ? todayIso : null);
    setActiveFilter(null);
  }, [cur, monthKey, todayIso]);

  const [busy, setBusy] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [mark, setMark] = useState({ userId: "", date: todayIso, status: "present", checkIn: "", checkOut: "" });
  const [member, setMember] = useState<any>(null);
  const [kiosk, setKiosk] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [en, setEn] = useState({ id: "", profile: emptyProfile });
  const [cam, setCam] = useState<null | { title: string; resolve: (b: Blob | null) => void }>(null);
  const askPhoto = (title: string) => new Promise<Blob | null>((resolve) => setCam({ title, resolve }));

  const me = useQuery({ queryKey: ["staff-me"], enabled: selfOn, queryFn: async () => (await gym.staffHr.me()).data });
  const sheet = useQuery({ queryKey: ["staff-records", monthKey, cur], enabled: isSheet && manager, queryFn: async () => await gym.staffHr.records(monthKey, cur!) });
  const visits = useQuery({ queryKey: ["member-visits", monthKey], enabled: isMember, queryFn: async () => (await gym.memberAtt.list({ month: monthKey })).data as any[] });
  const showVirtual = !!selectedDate && selectedDate <= todayIso;
  const nci = useQuery({ queryKey: ["member-nci", selectedDate], enabled: isMember && showVirtual, queryFn: async () => (await gym.memberAtt.notCheckedIn(selectedDate!)).data as any[] });

  const refresh = () => ["staff-me", "staff-records", "member-visits", "member-nci"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (fn: () => Promise<any>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) notify.success(done);
      refresh();
      return true;
    } catch (e: any) {
      notify.error("Failed", e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // real rows, one shape for every group
  const rows: Row[] = useMemo(() => {
    if (isMember)
      return (visits.data || []).map((v: any) => ({ id: v._id, who: v.memberId?.name || "-", whoId: v.memberId?._id, sub: v.memberId?.memberCode, date: v.day, checkIn: v.checkIn, checkOut: v.checkOut, hours: 0, status: v.checkOut ? "done" : "inside", via: v.verifyMode, loc: v.checkInLocation?.lat != null ? v.checkInLocation : undefined }));
    const names = new Map<string, any>((sheet.data?.roster || []).map((u: any) => [u._id, u]));
    return (sheet.data?.data || []).map((r: any) => ({ id: r._id, who: names.get(r.userId)?.name || "-", whoId: r.userId, sub: names.get(r.userId)?.role, date: r.date, checkIn: r.checkIn, checkOut: r.checkOut, hours: r.hours, status: r.status, via: r.verifyMode, loc: r.checkInLocation }));
  }, [isMember, visits.data, sheet.data]);

  // NestHR behaviour: on a picked day, everyone without a record appears as "Not checked in" (or "Weekly off")
  const virtualRows: Row[] = useMemo(() => {
    if (!showVirtual || !selectedDate) return [];
    const seen = new Set(rows.filter((r) => r.date === selectedDate).map((r) => r.whoId));
    if (isMember)
      return (nci.data || []).filter((m: any) => !seen.has(m._id)).map((m: any) => ({ id: `v_${m._id}`, who: m.name, whoId: m._id, sub: m.memberCode, date: selectedDate, hours: 0, status: "not_checked_in", virtual: true }));
    const dow = new Date(`${selectedDate}T00:00:00`).getDay();
    return (sheet.data?.roster || [])
      .filter((u: any) => !seen.has(u._id) && (!u.joined || u.joined <= selectedDate))
      .map((u: any) => ({ id: `v_${u._id}`, who: u.name, whoId: u._id, sub: u.role, date: selectedDate, hours: 0, status: (u.workDays || []).includes(dow) ? "not_checked_in" : "weekend", virtual: true }));
  }, [showVirtual, selectedDate, isMember, rows, nci.data, sheet.data]);

  const scoped = [...(selectedDate ? rows.filter((r) => r.date === selectedDate) : rows), ...virtualRows];
  const count = (f: (r: Row) => boolean) => scoped.filter(f).length;
  const cards = isMember
    ? [
        { label: "Visits", value: count((r) => !r.virtual), icon: Users, color: "#024BAB", key: "total" },
        { label: "Inside now", value: count((r) => r.status === "inside"), icon: UserCheck, color: "#00C48C", key: "inside" },
        { label: "Not checked in", value: count((r) => r.status === "not_checked_in"), icon: Clock, color: "#6B7280", key: "not_checked_in" },
      ]
    : [
        { label: "Total", value: count((r) => r.status !== "weekend"), icon: Users, color: "#024BAB", key: "total" },
        { label: "Present", value: count((r) => r.status === "present"), icon: UserCheck, color: "#00C48C", key: "present" },
        { label: "Absent", value: count((r) => r.status === "absent"), icon: UserX, color: "#EF4444", key: "absent" },
        { label: "Half Day", value: count((r) => r.status === "half_day"), icon: Timer, color: "#F59E0B", key: "half_day" },
        { label: "Late", value: count((r) => r.status === "late"), icon: AlarmClock, color: "#A855F7", key: "late" },
        { label: "On Leave", value: count((r) => r.status.endsWith("_leave")), icon: Palmtree, color: "#EAB308", key: "leave" },
        { label: "Not checked in", value: count((r) => r.status === "not_checked_in"), icon: Clock, color: "#6B7280", key: "not_checked_in" },
      ];
  const filtered = scoped.filter((r) => {
    if (!activeFilter || activeFilter === "total") return true;
    if (activeFilter === "leave") return r.status.endsWith("_leave");
    return r.status === activeFilter;
  });
  const display = [...filtered].sort((a, b) => (a.date === b.date ? Number(!!a.virtual) - Number(!!b.virtual) : a.date < b.date ? 1 : -1));

  const stripDays = Array.from({ length: Math.min(STRIP, daysInMonth - windowStart + 1) }, (_, i) => {
    const day = windowStart + i;
    const iso = `${monthKey}-${String(day).padStart(2, "0")}`;
    const on = rows.filter((r) => r.date === iso);
    return { day, iso, date: new Date(`${iso}T00:00:00`), p: on.filter((r) => ["present", "late", "half_day", "inside", "done"].includes(r.status)).length, a: on.filter((r) => r.status === "absent").length };
  });

  const unrecorded = isSheet && manager ? virtualRows.filter((r) => r.status === "not_checked_in") : [];

  const openMark = (r?: Row) => {
    setMark({ userId: r?.whoId || "", date: r?.date || selectedDate || todayIso, status: r?.virtual || !r ? "present" : r.status, checkIn: r?.checkIn || "", checkOut: r?.checkOut || "" });
    setMarkOpen(true);
  };
  const openEnroll = () => {
    setEn({ id: "", profile: emptyProfile });
    setMember(null);
    setEnrollOpen(true);
  };
  const pickPerson = (id: string) => {
    const u = (sheet.data?.roster || []).find((x: any) => x._id === id);
    setEn({ id, profile: u ? profileOf(u) : emptyProfile });
  };

  // Self punch: location and/or selfie are collected only when the gym's (or the person's) rules ask for them
  const selfPunch = async (dir: "in" | "out") => {
    const rules = me.data?.geo || {};
    let fields: any = {};
    let photo: Blob | null = null;
    try {
      if (rules.enabled) fields = await getPos();
      if (rules.requireFace) {
        photo = await askPhoto(dir === "in" ? "Selfie to check in" : "Selfie to check out");
        if (!photo) return;
      }
    } catch (e: any) {
      return notify.error("Failed", e.message);
    }
    run(() => (dir === "in" ? gym.staffHr.checkIn(fields, photo) : gym.staffHr.checkOut(fields, photo)), dir === "in" ? "Checked in" : "Checked out");
  };
  const enrollMemberFace = async () => {
    const photo = await askPhoto("Capture face to enroll");
    if (photo) run(() => gym.attendance.enroll("member", { id: member?._id || member?.id }, photo), "Face enrolled");
  };

  const row = me.data?.today;
  const bal = me.data?.balance || {};
  const enrollee = (sheet.data?.roster || []).find((u: any) => u._id === en.id);

  return (
    <AppLayout title="Attendance">
      {selfOn && (
        <section className="border-2 border-black bg-white p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-lg">My attendance today</h3>
            <p className="text-sm text-gray-600">
              {row?.checkIn ? `Checked in at ${row.checkIn}${row.checkOut ? `, out at ${row.checkOut}` : ""}${row.status === "late" ? " (late)" : ""}` : row ? `Marked ${row.status.replace("_", " ")}` : "Not checked in yet"}
              {" · "}Casual left {bal.casual?.left ?? "-"}, sick left {bal.sick?.left ?? "-"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn busy={busy} disabled={!!row?.checkIn || row?.status?.endsWith("leave")} onClick={() => selfPunch("in")}>
              <LogIn className="w-4 h-4" /> Check in
            </Btn>
            <Btn light busy={busy} disabled={!row?.checkIn || !!row?.checkOut} onClick={() => selfPunch("out")}>
              <LogOut className="w-4 h-4" /> Check out
            </Btn>
            <Btn light onClick={() => navigate("/leave")}>
              <CalendarOff className="w-4 h-4" /> Request leave
            </Btn>
          </div>
        </section>
      )}

      {tabs.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {tabs.map((t) => (
            <Btn key={t.key} light={cur !== t.key} onClick={() => setTab(t.key)}>{t.label}</Btn>
          ))}
        </div>
      )}

      {(isSheet || isMember) && (
        <>
          {/* Top bar: month/year + buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setWindowStart(1); }} className="border-2 border-black px-3 py-2 text-sm font-semibold outline-none bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border-2 border-black px-3 py-2 text-sm font-semibold outline-none bg-white">
                {Array.from({ length: 5 }, (_, i) => Number(todayIso.slice(0, 4)) - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="border-2 border-black px-3 py-2 text-xs font-bold bg-white hover:bg-gray-50 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Clear date
                </button>
              )}
            </div>
            {(isMember ? desk : manager) && (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setKiosk(true)} className="border-2 bg-white text-[#024BAB] px-4 py-2 text-sm flex items-center gap-1.5">
                  <ScanFace className="w-4 h-4" /> Face Attendance
                </button>
                <button onClick={openEnroll} className="border-2 bg-white text-[#024BAB] px-4 py-2 text-sm flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4" /> {isMember ? "Face & device ID" : "Attendance settings"}
                </button>
                <button onClick={() => (isMember ? setMarkOpen(true) : openMark())} className="border-2 bg-[#024BAB] text-white px-4 py-2 text-sm flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> {isMember ? "Check in member" : "Mark Attendance"}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 mb-5">
            {cards.map((c) => {
              const active = activeFilter === c.key;
              return <StatCard key={c.key} label={c.label} value={c.value} icon={c.icon} color={c.color} active={active} onClick={() => setActiveFilter(active || c.key === "total" ? null : c.key)} />;
            })}
          </div>

          {/* Date strip */}
          <div className="border-2 border-black bg-white mb-5 flex items-stretch">
            <button onClick={() => setWindowStart((s) => Math.max(1, s - STRIP))} disabled={windowStart <= 1} className="px-3 border-r-2 border-black hover:bg-[#024BAB]/5 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-1 overflow-hidden">
              {stripDays.map(({ day, date, iso, p, a }) => {
                const isToday = iso === todayIso;
                const sel = iso === selectedDate;
                const weekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <button key={iso} onClick={() => setSelectedDate(sel ? null : iso)} className={cn("flex-1 flex flex-col items-center justify-center py-3 px-1 border-r last:border-r-0 border-black/10 transition-colors relative", sel ? "bg-[#024BAB] text-white" : isToday ? "bg-[#024BAB]/5" : weekend ? "bg-gray-50" : "hover:bg-[#024BAB]/5")}>
                    {isToday && !sel && <span className="absolute top-1.5 w-1.5 h-1.5 rounded-full bg-[#024BAB]" />}
                    <span className={cn("text-xs font-bold whitespace-nowrap mb-2", sel ? "text-white" : isToday ? "text-[#024BAB]" : weekend ? "text-gray-400" : "text-black")}>
                      {DAY_ABBR[date.getDay()]}, {date.toLocaleDateString("en-IN", { month: "short" })} {day}
                    </span>
                    {p > 0 || a > 0 ? (
                      <div className="flex flex-col items-center gap-0.5">
                        {p > 0 && <span className={cn("text-[11px] font-bold leading-none", sel ? "text-[#86efac]" : "text-[#00C48C]")}>{p}{isMember ? "" : "P"}</span>}
                        {a > 0 && <span className={cn("text-[11px] font-bold leading-none", sel ? "text-[#fca5a5]" : "text-[#EF4444]")}>{a}A</span>}
                      </div>
                    ) : (
                      <span className={cn("text-[10px]", sel ? "text-white/40" : "text-gray-300")}>—</span>
                    )}
                    {sel && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setWindowStart((s) => Math.max(1, Math.min(daysInMonth - STRIP + 1, s + STRIP)))} disabled={windowStart + STRIP > daysInMonth} className="px-3 border-l-2 border-black hover:bg-[#024BAB]/5 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {unrecorded.length > 0 && (
            <div className="mb-4 border-2 border-[#EF4444] bg-[#EF4444]/5 px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <UserX className="w-4 h-4 text-[#EF4444] shrink-0" />
                <p className="text-sm font-bold text-[#EF4444]">{unrecorded.length} {cur === "trainer" ? "trainer" : "staff member"}{unrecorded.length > 1 ? "s" : ""} have no record for this date</p>
              </div>
              <button disabled={busy} onClick={() => run(async () => { for (const u of unrecorded) await gym.staffHr.mark({ userId: u.whoId, date: selectedDate, status: "absent" }); }, "Marked absent")} className="border-2 border-[#EF4444] bg-[#EF4444] text-white text-xs font-bold px-3 py-1.5 hover:bg-[#dc2626] disabled:opacity-50 shrink-0">
                {busy ? "Saving…" : "Mark All Absent"}
              </button>
            </div>
          )}

          {display.length === 0 ? (
            <div className="border-2 bg-white p-12 flex flex-col items-center justify-center">
              <Clock className="w-12 h-12 text-gray-300 mb-3" />
              <p className="font-bold text-black">No attendance records</p>
              <p className="text-sm text-gray-500 mt-1">for {MONTHS[month - 1]} {year}</p>
            </div>
          ) : (
            <div className="border-2 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black bg-[#024BAB]/5">
                    {[isMember ? "Member" : cur === "trainer" ? "Trainer" : "Staff", "Date", "Check In", "Check Out", ...(isMember ? [] : ["Hours"]), "Via", "Status", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => {
                    const Icon = STATUS_ICONS[r.status] || Clock;
                    const v = r.via ? VIA[r.via] || VIA.manual : null;
                    const V = v?.icon;
                    return (
                      <tr key={r.id} className={cn("border-b border-black/10 hover:bg-[#024BAB]/5 transition-colors", i % 2 ? "bg-[#F8FAFF]" : "")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-[#024BAB] border-2 border-black flex items-center justify-center text-[10px] font-bold text-white shrink-0 rounded-full">{r.who[0]?.toUpperCase()}</div>
                            <span className="font-bold text-black text-xs">{r.who}</span>
                            {r.sub && <span className="text-[10px] text-gray-500 capitalize">{r.sub.replace("_", " ")}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-black text-xs">{new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-3 text-black text-xs">{r.checkIn || "—"}</td>
                        <td className="px-4 py-3 text-black text-xs">{r.checkOut || "—"}</td>
                        {!isMember && <td className="px-4 py-3 text-black text-xs">{r.hours ? `${r.hours.toFixed(1)}h` : "—"}</td>}
                        <td className="px-4 py-3">
                          {v && V ? (
                            <span className="flex items-center gap-1.5">
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold border-2", v.cls)}><V className="w-3 h-3" />{v.label}</span>
                              {r.loc && (
                                <a href={`https://www.google.com/maps?q=${r.loc.lat},${r.loc.lng}`} target="_blank" rel="noreferrer" title={r.loc.distanceMeters != null ? `${Math.round(r.loc.distanceMeters)} m from the gym` : "Check-in location"} className="p-1 border-2 border-black hover:bg-[#024BAB] hover:text-white"><MapPin className="w-3 h-3" /></a>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("border-2 text-[10px] capitalize flex items-center gap-1 w-fit px-2 py-0.5", STATUS_COLORS[r.status])}>
                            <Icon className="w-3 h-3" /> {STATUS_LABEL[r.status] || r.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isMember && r.status === "inside" && r.date === todayIso && (
                            <Btn light busy={busy} onClick={() => run(() => gym.memberAtt.checkOut(r.whoId), "Checked out")}>Check out</Btn>
                          )}
                          {isMember && r.status === "not_checked_in" && r.date === todayIso && desk && (
                            <Btn busy={busy} onClick={() => run(() => gym.memberAtt.checkIn(r.whoId), "Checked in")}>Check in</Btn>
                          )}
                          {isSheet && manager && <Btn light onClick={() => openMark(r)}>{r.virtual ? "Mark" : "Edit"}</Btn>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tabs.length === 0 && !selfOn && (
        <div className="border-2 bg-white p-12 text-center text-sm text-gray-600">Attendance is not available for your role.</div>
      )}

      {cam && <FaceCapture title={cam.title} onDone={(b) => { cam.resolve(b); setCam(null); }} />}
      {kiosk && <FaceKioskModal onClose={() => setKiosk(false)} onMarked={refresh} />}

      {/* Mark attendance: staff / trainers (day status) or members (check in / out) */}
      <Modal
        open={markOpen}
        title={isMember ? "Check in member" : "Mark attendance"}
        onClose={() => setMarkOpen(false)}
        footer={
          isMember ? (
            <>
              <Btn light disabled={!member} busy={busy} onClick={async () => { if (await run(() => gym.memberAtt.checkOut(member._id || member.id), "Checked out")) setMarkOpen(false); }}>Check out</Btn>
              <Btn disabled={!member} busy={busy} onClick={async () => { if (await run(() => gym.memberAtt.checkIn(member._id || member.id), "Checked in")) { setMarkOpen(false); setMember(null); } }}>Check in</Btn>
            </>
          ) : (
            <>
              <Btn light onClick={() => setMarkOpen(false)}>Cancel</Btn>
              <Btn disabled={!mark.userId} busy={busy} onClick={async () => { if (await run(() => gym.staffHr.mark({ ...mark, checkIn: mark.checkIn || undefined, checkOut: mark.checkOut || undefined }), "Saved")) setMarkOpen(false); }}>Save</Btn>
            </>
          )
        }
      >
        {isMember ? (
          <MemberPicker value={member} onChange={setMember} />
        ) : (
          <>
            <SelectInput label={cur === "trainer" ? "Trainer" : "Staff"} placeholder="Select" options={(sheet.data?.roster || []).map((u: any) => ({ value: u._id, label: u.name }))} value={mark.userId} onChange={(v: string) => setMark({ ...mark, userId: v })} />
            <TextInput label="Date" type="date" value={mark.date} onChange={(e: any) => setMark({ ...mark, date: e.target.value })} />
            <SelectInput label="Status" options={["present", "late", "absent", "half_day", "paid_leave", "unpaid_leave", "weekly_off", "holiday"]} value={mark.status} onChange={(v: string) => setMark({ ...mark, status: v })} />
            <TextInput label="Check in" type="time" value={mark.checkIn} onChange={(e: any) => setMark({ ...mark, checkIn: e.target.value })} />
            <TextInput label="Check out" type="time" value={mark.checkOut} onChange={(e: any) => setMark({ ...mark, checkOut: e.target.value })} />
          </>
        )}
      </Modal>

      {/* Staff / trainers: the same Attendance tab as the add form. Members: face + device ID. */}
      <Modal
        open={enrollOpen}
        wide={!isMember}
        title={isMember ? "Face & device ID" : "Attendance settings"}
        onClose={() => setEnrollOpen(false)}
        footer={
          isMember ? (
            <>
              <Btn light onClick={() => setEnrollOpen(false)}>Close</Btn>
              <Btn light busy={busy} disabled={!member} onClick={() => run(() => gym.attendance.enroll("member", { id: member?._id || member?.id, biometricId: en.profile.biometricId }), "Saved")}>Save device ID</Btn>
              <Btn busy={busy} disabled={!member} onClick={enrollMemberFace}>Capture face</Btn>
            </>
          ) : (
            <>
              <Btn light onClick={() => setEnrollOpen(false)}>Close</Btn>
              <Btn busy={busy} disabled={!en.id} onClick={async () => { if (await run(() => saveProfile(en.id, en.profile), "Saved")) setEnrollOpen(false); }}>Save</Btn>
            </>
          )
        }
      >
        {isMember ? (
          <>
            <MemberPicker value={member} onChange={setMember} />
            <TextInput label="Biometric ID" inputMode="numeric" value={en.profile.biometricId} onChange={(e: any) => setEn({ ...en, profile: { ...en.profile, biometricId: e.target.value.replace(/[^0-9]/g, "") } })} hint="The number this member is enrolled under on the device (leave blank if none)" />
            <p className="text-xs text-gray-500">&ldquo;Capture face&rdquo; saves the face used by the Face Attendance kiosk. The photo itself is not stored.</p>
          </>
        ) : (
          <>
            <SelectInput label={cur === "trainer" ? "Trainer" : "Staff"} placeholder="Select" options={(sheet.data?.roster || []).map((u: any) => ({ value: u._id, label: u.name }))} value={en.id} onChange={pickPerson} />
            {en.id && <AttendanceProfileFields key={en.id} value={en.profile} onChange={(p) => setEn({ ...en, profile: p })} personId={en.id} faceEnrolled={enrollee?.faceEnrolled} />}
          </>
        )}
      </Modal>
    </AppLayout>
  );
}
