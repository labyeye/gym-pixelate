import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  Users,
  X,
  Armchair,
  Hourglass,
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
  Panel,
  Pill,
  RowActions,
  SelectInput,
  StatCard,
  StatGrid,
  Tabs,
  Td,
  TextArea,
  TextInput,
  Tr,
  fmtDate,
  inr,
  titleCase,
} from "@/components/gym/kit";
import { MemberPicker, useTrainers } from "@/components/gym/pickers";
import { cn } from "@/lib/utils";

const CATS = [
  "yoga",
  "zumba",
  "hiit",
  "crossfit",
  "spin",
  "pilates",
  "aerobics",
  "martial_arts",
  "dance",
  "other",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const timeOf = (d: string) =>
  new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const dayKey = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
const blank = {
  name: "",
  category: "other",
  description: "",
  trainerId: "",
  room: "",
  capacity: "20",
  durationMin: "60",
  dropInPrice: "0",
  creditsRequired: "1",
  days: [] as number[],
  times: "06:30",
  isActive: true,
};

export default function ClassesPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = usePermission();
  const trainers = useTrainers();
  const [tab, setTab] = useState("schedule");
  const [book, setBook] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [roster, setRoster] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>(blank);
  const [busy, setBusy] = useState(false);

  const { data: sess, isLoading } = useQuery({
    queryKey: ["class-sessions"],
    queryFn: () => gym.classes.sessions({ days: 7 }),
  });
  const { data: classes } = useQuery({
    queryKey: ["classes", "all"],
    queryFn: () => gym.classes.list({ limit: 100 }),
  });
  const { data: rosterRes } = useQuery({
    queryKey: ["roster", roster?.classId, roster?.sessionDate],
    queryFn: () =>
      gym.classes.roster({
        classId: roster.classId,
        sessionDate: roster.sessionDate,
      }),
    enabled: !!roster,
  });

  const sessions: any[] = sess?.data || [];
  const byDay = useMemo(
    () =>
      sessions.reduce(
        (m: Record<string, any[]>, s) => {
          (m[dayKey(s.sessionDate)] ||= []).push(s);
          return m;
        },
        {} as Record<string, any[]>,
      ),
    [sessions],
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["class-sessions"] });
    qc.invalidateQueries({ queryKey: ["roster"] });
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  const doBook = async () => {
    try {
      setBusy(true);
      const r = await gym.classes.book({
        classId: book.classId,
        memberId: member._id,
        sessionDate: book.sessionDate,
      });
      notify.success(
        r.waitlisted ? "Added to waitlist" : "Booked",
        `${member.name} · ${book.name}`,
      );
      setBook(null);
      setMember(null);
      refresh();
    } catch (e: any) {
      notify.error("Could not book", e.message);
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      refresh();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  const openEdit = (c?: any) => {
    if (!c) {
      setForm(blank);
      setEdit("new");
      return;
    }
    const days = [...new Set<number>(c.schedule.map((s: any) => s.day))];
    const times = [
      ...new Set<string>(c.schedule.map((s: any) => s.start)),
    ].join(", ");
    setForm({
      ...blank,
      ...c,
      trainerId: c.trainerId?._id || "",
      capacity: String(c.capacity),
      durationMin: String(c.durationMin),
      dropInPrice: String(c.dropInPrice),
      creditsRequired: String(c.creditsRequired),
      days,
      times,
    });
    setEdit(c);
  };
  const saveClass = async () => {
    const times = String(form.times)
      .split(/[,\s]+/)
      .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
      .map((t) => t.padStart(5, "0"));
    if (!form.name.trim()) return notify.error("Class name is required");
    if (!form.days.length || !times.length)
      return notify.error(
        "Pick at least one day and a start time (e.g. 06:30)",
      );
    const body = {
      name: form.name,
      category: form.category,
      description: form.description,
      trainerId: form.trainerId || undefined,
      room: form.room,
      capacity: Number(form.capacity),
      durationMin: Number(form.durationMin),
      dropInPrice: Number(form.dropInPrice) || 0,
      creditsRequired: Number(form.creditsRequired) || 1,
      isActive: form.isActive,
      schedule: form.days.flatMap((day: number) =>
        times.map((start) => ({ day, start })),
      ),
    };
    try {
      setBusy(true);
      if (edit === "new") await gym.classes.create(body);
      else await gym.classes.update(edit._id, body);
      notify.success("Class saved");
      setEdit(null);
      refresh();
    } catch (e: any) {
      notify.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const totalSeats = sessions.reduce((s, x) => s + x.capacity, 0);
  const booked = sessions.reduce((s, x) => s + x.booked, 0);

  return (
    <AppLayout title="Group Classes">
      <StatGrid>
        <StatCard
          label="Sessions (7 days)"
          value={sessions.length}
          icon={CalendarDays}
          color="#024BAB"
        />
        <StatCard
          label="Seats booked"
          value={booked}
          sub={
            totalSeats
              ? `${Math.round((booked / totalSeats) * 100)}% full`
              : undefined
          }
          icon={Armchair}
          color="#00C48C"
        />
        <StatCard
          label="On waitlists"
          value={sessions.reduce((s, x) => s + x.waitlisted, 0)}
          icon={Hourglass}
          color="#FA731C"
        />
        <StatCard
          label="Active classes"
          value={(classes?.data || []).filter((c: any) => c.isActive).length}
          icon={Users}
          color="#A855F7"
        />
      </StatGrid>

      <div className="flex flex-wrap justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "schedule", label: "Upcoming sessions" },
            { id: "classes", label: "Class setup" },
          ]}
        />
        {tab === "classes" && can("Classes", "create") && (
          <Btn onClick={() => openEdit()}>
            <Plus className="w-4 h-4" /> New class
          </Btn>
        )}
      </div>

      {tab === "schedule" &&
        (isLoading ? (
          <p className="font-black uppercase text-black/30">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm font-black uppercase tracking-widest text-black/30 py-10 text-center">
            No sessions scheduled. Add a class with a weekly schedule.
          </p>
        ) : (
          <div className="space-y-6">
            {(Object.entries(byDay) as [string, any[]][]).map(([day, list]) => (
              <div key={day}>
                <h3 className="text-xs font-black uppercase tracking-widest mb-2">
                  {day}
                </h3>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((s) => {
                    const full = s.seatsLeft === 0;
                    return (
                      <div
                        key={s.classId + s.sessionDate}
                        className="nb-card nb-rise nb-lift p-4"
                      >
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-black text-lg truncate">
                              {s.name}
                            </p>
                            <p className="text-xs font-bold text-black/50">
                              {timeOf(s.sessionDate)} · {s.durationMin} min
                              {s.room ? ` · ${s.room}` : ""}
                            </p>
                          </div>
                          <Pill
                            value={s.category}
                            className="nb-tag-purple h-fit"
                          />
                        </div>
                        <p className="text-xs font-bold mt-1">
                          {s.trainer ? `with ${s.trainer}` : "No trainer set"}
                        </p>
                        <div className="mt-3 h-3 border-2 border-black bg-white">
                          <div
                            className={cn(
                              "h-full",
                              full ? "bg-[#EF4444]" : "bg-[#00C48C]",
                            )}
                            style={{
                              width: `${Math.min(100, (s.booked / s.capacity) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs font-black uppercase">
                            {s.booked}/{s.capacity} booked
                            {s.waitlisted ? ` · ${s.waitlisted} waiting` : ""}
                          </span>
                          <div className="flex gap-1.5">
                            <ActionButton
                              label="Roster"
                              icon={Users}
                              onClick={() => setRoster(s)}
                            />
                            {can("Classes", "create") && (
                              <Btn
                                className="!py-1 !px-3 text-xs"
                                color={full ? "#FA731C" : "#024BAB"}
                                onClick={() => {
                                  setBook(s);
                                  setMember(null);
                                }}
                              >
                                {full ? "Waitlist" : "Book"}
                              </Btn>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === "classes" && (
        <DataTable
          head={[
            "Class",
            "Trainer",
            "Schedule",
            "Capacity",
            "Drop-in",
            "Status",
            "Actions",
          ]}
          empty={(classes?.data || []).length === 0}
        >
          {(classes?.data || []).map((c: any, i: number) => (
            <Tr key={c._id} i={i}>
              <Td>
                <p className="font-black">{c.name}</p>
                <p className="text-xs text-black/50">
                  {titleCase(c.category)}
                  {c.room ? ` · ${c.room}` : ""}
                </p>
              </Td>
              <Td className="font-bold">{c.trainerId?.name || "—"}</Td>
              <Td className="text-xs font-bold">
                {[...new Set<number>(c.schedule.map((s: any) => s.day))]
                  .sort()
                  .map((d) => DAYS[d])
                  .join(" ")}{" "}
                · {[...new Set(c.schedule.map((s: any) => s.start))].join(", ")}
              </Td>
              <Td className="font-bold">{c.capacity}</Td>
              <Td>{c.dropInPrice ? inr(c.dropInPrice) : "—"}</Td>
              <Td>
                <Pill value={c.isActive ? "active" : "inactive"} />
              </Td>
              <Td>
                <RowActions>
                  {can("Classes", "update") && (
                    <ActionButton
                      label="Edit"
                      icon={Pencil}
                      onClick={() => openEdit(c)}
                    />
                  )}
                  {can("Classes", "delete") && (
                    <ActionButton
                      label="Delete"
                      icon={Trash2}
                      tone="danger"
                      onClick={() =>
                        window.confirm(`Delete ${c.name}?`) &&
                        act(() => gym.classes.remove(c._id), "Class deleted")
                      }
                    />
                  )}
                </RowActions>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={!!book}
        title={`${book?.waitlisted !== undefined && book?.seatsLeft === 0 ? "Join waitlist" : "Book"} — ${book?.name || ""}`}
        subtitle={
          book
            ? `${dayKey(book.sessionDate)} · ${timeOf(book.sessionDate)}`
            : undefined
        }
        onClose={() => setBook(null)}
        footer={
          <>
            <Btn light onClick={() => setBook(null)}>
              Cancel
            </Btn>
            <Btn busy={busy} disabled={!member} onClick={doBook}>
              Confirm
            </Btn>
          </>
        }
      >
        <MemberPicker value={member} onChange={setMember} required />
        <p className="text-xs font-bold text-black/50">
          Needs an active membership that includes classes (or a drop-in price
          on the class).
        </p>
      </Modal>

      <Modal
        open={!!roster}
        title={`Roster — ${roster?.name || ""}`}
        subtitle={
          roster
            ? `${dayKey(roster.sessionDate)} · ${timeOf(roster.sessionDate)}`
            : undefined
        }
        onClose={() => setRoster(null)}
        footer={
          <Btn light onClick={() => setRoster(null)}>
            Close
          </Btn>
        }
      >
        {(rosterRes?.data || []).length === 0 ? (
          <p className="text-xs font-bold text-black/40 uppercase">
            No bookings yet
          </p>
        ) : (
          <ul className="divide-y divide-black/10">
            {(rosterRes?.data || []).map((b: any) => (
              <li
                key={b._id}
                className="py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-black truncate">{b.memberId?.name}</p>
                  <p className="text-xs text-black/50">{b.memberId?.phone}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Pill value={b.status} />
                  {b.status === "booked" && (
                    <>
                      <ActionButton
                        label="Attended"
                        icon={Check}
                        tone="primary"
                        onClick={() =>
                          act(
                            () => gym.classes.mark(b._id, "attended"),
                            "Marked attended",
                          )
                        }
                      />
                      <ActionButton
                        label="No-show"
                        icon={UserMinus}
                        onClick={() =>
                          act(
                            () => gym.classes.mark(b._id, "no_show"),
                            "Marked no-show",
                          )
                        }
                      />
                    </>
                  )}
                  {["booked", "waitlisted"].includes(b.status) && (
                    <ActionButton
                      label="Cancel booking"
                      icon={X}
                      tone="danger"
                      onClick={() =>
                        act(
                          () => gym.classes.cancel(b._id),
                          "Booking cancelled",
                        )
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={!!edit}
        wide
        title={edit === "new" ? "New class" : "Edit class"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Btn light onClick={() => setEdit(null)}>
              Cancel
            </Btn>
            <Btn busy={busy} onClick={saveClass}>
              Save class
            </Btn>
          </>
        }
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <TextInput
            label="Class name"
            required
            value={form.name}
            onChange={(e: any) => setForm({ ...form, name: e.target.value })}
          />
          <SelectInput
            label="Category"
            options={CATS}
            value={form.category}
            onChange={(v: string) => setForm({ ...form, category: v })}
          />
          <SelectInput
            label="Trainer"
            placeholder="— none —"
            options={trainers}
            value={form.trainerId}
            onChange={(v: string) => setForm({ ...form, trainerId: v })}
          />
          <TextInput
            label="Room / studio"
            value={form.room}
            onChange={(e: any) => setForm({ ...form, room: e.target.value })}
          />
          <TextInput
            label="Capacity"
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e: any) =>
              setForm({ ...form, capacity: e.target.value })
            }
          />
          <TextInput
            label="Duration (min)"
            type="number"
            min={5}
            value={form.durationMin}
            onChange={(e: any) =>
              setForm({ ...form, durationMin: e.target.value })
            }
          />
          <TextInput
            label="Drop-in price (₹)"
            type="number"
            min={0}
            value={form.dropInPrice}
            onChange={(e: any) =>
              setForm({ ...form, dropInPrice: e.target.value })
            }
            hint="For non-members / plans without classes"
          />
          <TextInput
            label="Credits per booking"
            type="number"
            min={1}
            value={form.creditsRequired}
            onChange={(e: any) =>
              setForm({ ...form, creditsRequired: e.target.value })
            }
          />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1">
            Runs on
          </p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <button
                type="button"
                key={d}
                onClick={() =>
                  setForm({
                    ...form,
                    days: form.days.includes(i)
                      ? form.days.filter((x: number) => x !== i)
                      : [...form.days, i],
                  })
                }
                className={cn(
                  "nb-badge px-3 py-1.5",
                  form.days.includes(i) ? "nb-tag-blue" : "nb-tag-white",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <TextInput
          label="Start time(s), 24h"
          value={form.times}
          onChange={(e: any) => setForm({ ...form, times: e.target.value })}
          hint="e.g. 06:30, 18:00 — every selected day gets each time"
        />
        <TextArea
          label="Description"
          value={form.description}
          onChange={(e: any) =>
            setForm({ ...form, description: e.target.value })
          }
        />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />{" "}
          Active (shows in the schedule)
        </label>
      </Modal>
    </AppLayout>
  );
}
