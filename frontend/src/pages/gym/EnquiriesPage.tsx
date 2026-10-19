import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  PhoneCall,
  StickyNote,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { ResourcePage } from "@/components/gym/ResourcePage";
import { waDigits } from "@/lib/countries";
import {
  ActionButton,
  Btn,
  Modal,
  Pill,
  StatCard,
  StatGrid,
  TextArea,
  TextInput,
  fmtDate,
  titleCase,
} from "@/components/gym/kit";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";

const STATUSES = [
  "new",
  "contacted",
  "trial_booked",
  "trial_done",
  "negotiating",
  "converted",
  "lost",
];
const SOURCES = [
  "walk_in",
  "call",
  "referral",
  "instagram",
  "facebook",
  "google",
  "website",
  "whatsapp",
  "poster",
  "other",
];
const LOST = [
  "price",
  "location",
  "timing",
  "joined_other_gym",
  "not_interested",
  "no_response",
  "other",
];
const wa = (phone: string, name: string) =>
  `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(`Hi ${name}, thanks for visiting us! Would you like to book a free trial session?`)}`;

export default function EnquiriesPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const [note, setNote] = useState<any | null>(null);
  const [text, setText] = useState("");
  const [follow, setFollow] = useState("");

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      qc.invalidateQueries({ queryKey: ["enquiries"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <ResourcePage<any>
      title="Enquiries & Trials"
      noun="enquiry"
      permission="Enquiries"
      api={gym.enquiries}
      queryKey="enquiries"
      filters={[
        { key: "status", label: "statuses", options: STATUSES },
        { key: "source", label: "sources", options: SOURCES },
      ]}
      stats={(rows, total) => {
        const n = (s: string) => rows.filter((r) => r.status === s).length;
        const due = rows.filter(
          (r) =>
            r.followUpAt &&
            new Date(r.followUpAt) <= new Date() &&
            !["converted", "lost"].includes(r.status),
        ).length;
        return (
          <StatGrid>
            <StatCard
              label="Total enquiries"
              value={total}
              icon={UserPlus}
              color="#024BAB"
            />
            <StatCard
              label="Follow-ups due"
              value={due}
              icon={CalendarClock}
              color={due ? "#EF4444" : "#14B8A6"}
              sub="today or overdue"
            />
            <StatCard
              label="Trials booked"
              value={n("trial_booked")}
              icon={PhoneCall}
              color="#A855F7"
            />
            <StatCard
              label="Converted"
              value={n("converted")}
              icon={UserCheck}
              color="#00C48C"
              sub={
                total
                  ? `${Math.round((n("converted") / Math.max(1, rows.length)) * 100)}% of this page`
                  : undefined
              }
            />
          </StatGrid>
        );
      }}
      columns={[
        {
          label: "Name",
          render: (r) => (
            <div>
              <p className="font-black">{r.name}</p>
              <p className="text-xs text-black/50">{r.phone}</p>
            </div>
          ),
        },
        {
          label: "Goal / Plan",
          render: (r) => (
            <div className="text-xs">
              <p className="font-bold">{r.goal || "—"}</p>
              <p className="text-black/50">{r.interestedPlanId?.name}</p>
            </div>
          ),
        },
        {
          label: "Source",
          render: (r) => (
            <span className="capitalize text-xs font-bold">
              {titleCase(r.source)}
            </span>
          ),
        },
        { label: "Status", render: (r) => <Pill value={r.status} /> },
        {
          label: "Follow-up",
          render: (r) => (
            <span
              className={
                r.followUpAt &&
                new Date(r.followUpAt) < new Date() &&
                !["converted", "lost"].includes(r.status)
                  ? "font-black text-red-600"
                  : "text-xs font-bold"
              }
            >
              {fmtDate(r.followUpAt)}
            </span>
          ),
        },
        {
          label: "Trial",
          render: (r) => (
            <span className="text-xs font-bold">
              {r.trial?.date
                ? `${fmtDate(r.trial.date)}${r.trial.attended ? " ✓" : ""}`
                : "—"}
            </span>
          ),
        },
      ]}
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "phone", label: "Phone", type: "tel", required: true },
        { key: "email", label: "Email", type: "email" },
        {
          key: "gender",
          label: "Gender",
          type: "select",
          options: ["male", "female", "other"],
        },
        {
          key: "goal",
          label: "Goal",
          placeholder: "Weight loss, muscle gain…",
        },
        { key: "interestedPlanId", label: "Interested in", type: "plan" },
        {
          key: "source",
          label: "Source",
          type: "select",
          options: SOURCES,
          default: "walk_in",
          required: true,
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: STATUSES,
          default: "new",
          required: true,
        },
        { key: "followUpAt", label: "Next follow-up", type: "date" },
        {
          key: "lostReason",
          label: "Lost reason",
          type: "select",
          options: LOST,
          hint: "Only if lost",
        },
      ]}
      toForm={(r) => ({
        ...r,
        interestedPlanId: r.interestedPlanId?._id || r.interestedPlanId,
      })}
      rowActions={(r) => (
        <>
          <ActionButton
            label="WhatsApp"
            icon={MessageCircle}
            onClick={() => window.open(wa(r.phone, r.name), "_blank")}
          />
          <ActionButton
            label="Add note / reschedule"
            icon={StickyNote}
            onClick={() => {
              setNote(r);
              setText("");
              setFollow("");
            }}
          />
          {!["converted", "lost"].includes(r.status) && (
            <ActionButton
              label="Convert to member"
              icon={CheckCircle2}
              tone="primary"
              onClick={() =>
                act(
                  () => gym.enquiries.convert(r._id),
                  "Converted — member created",
                )
              }
            />
          )}
          {!["converted", "lost"].includes(r.status) && (
            <ActionButton
              label="Mark lost"
              icon={XCircle}
              tone="danger"
              onClick={() => {
                const reason = window.prompt(
                  `Why was ${r.name} lost? (${LOST.join(", ")})`,
                  "price",
                );
                if (reason)
                  act(
                    () =>
                      gym.enquiries.update(r._id, {
                        status: "lost",
                        lostReason: reason,
                      }),
                    "Marked lost",
                  );
              }}
            />
          )}
        </>
      )}
      after={
        <Modal
          open={!!note}
          title={`Notes — ${note?.name || ""}`}
          onClose={() => setNote(null)}
          footer={
            <>
              <Btn light onClick={() => setNote(null)}>
                Close
              </Btn>
              <Btn
                onClick={() =>
                  act(async () => {
                    await gym.enquiries.note(note._id, {
                      text,
                      followUpAt: follow || undefined,
                    });
                    setNote(null);
                  }, "Note saved")
                }
                disabled={!text.trim()}
              >
                Save note
              </Btn>
            </>
          }
        >
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(note?.notes || []).length === 0 ? (
              <p className="text-xs font-bold text-black/40 uppercase">
                No notes yet
              </p>
            ) : (
              note.notes.map((n: any, i: number) => (
                <div key={i} className="border-2 border-black p-2 text-sm">
                  <p>{n.text}</p>
                  <p className="text-[10px] font-bold text-black/50 uppercase mt-1">
                    {n.by} · {fmtDate(n.at)}
                  </p>
                </div>
              ))
            )}
          </div>
          <TextArea
            label="New note"
            value={text}
            onChange={(e: any) => setText(e.target.value)}
            rows={3}
          />
          <TextInput
            label="Next follow-up"
            type="date"
            value={follow}
            onChange={(e: any) => setFollow(e.target.value)}
          />
        </Modal>
      }
    />
  );
}
