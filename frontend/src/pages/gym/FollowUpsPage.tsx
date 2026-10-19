import { waDigits } from "@/lib/countries";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  HeartPulse,
  IndianRupee,
  MessageCircle,
  PhoneCall,
  Repeat,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import {
  Btn,
  DataTable,
  Modal,
  Panel,
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
import { useNotify } from "@/components/ui/Notification";

const TABS = [
  { id: "all", label: "Everything" },
  { id: "renewal", label: "Expiring" },
  { id: "lapsed", label: "Lapsed" },
  { id: "dues", label: "Dues" },
  { id: "at_risk", label: "At risk" },
  { id: "trial", label: "Trials" },
  { id: "pt_renewal", label: "PT renewals" },
  { id: "funnel", label: "Lead funnel" },
];
const OUTCOMES = [
  "contacted",
  "interested",
  "no_answer",
  "unavailable",
  "returning",
  "renewed",
  "not_interested",
];
const REMINDER: Record<string, (n: string, t: string) => string> = {
  renewal: (n, t) => `Hi ${n}, ${t}. Renew today to keep your streak going!`,
  lapsed: (n) =>
    `Hi ${n}, we miss you at the gym! Renew this week and get back on track.`,
  dues: (n, t) =>
    `Hi ${n}, a gentle reminder: ${t}. Please clear it at the front desk or online.`,
  at_risk: (n) =>
    `Hi ${n}, we haven't seen you in a while. Everything okay? Your trainer is happy to help you restart.`,
  trial: (n) =>
    `Hi ${n}, thanks for trying us out! Would you like to join? We have a plan that fits you.`,
  pt_renewal: (n, t) =>
    `Hi ${n}, ${t}. Want to renew your personal-training package?`,
};
const waLink = (phone: string | undefined, text: string) => {
  const d = waDigits(phone);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
};

export default function FollowUpsPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [snoozed, setSnoozed] = useState(false);
  const [target, setTarget] = useState<any | null>(null);
  const [outcome, setOutcome] = useState("contacted");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");

  const list = useQuery({
    queryKey: ["retention", snoozed],
    queryFn: () => gym.retention.opportunities({ includeSnoozed: snoozed }),
    enabled: tab !== "funnel",
  });
  const funnel = useQuery({
    queryKey: ["retention-funnel"],
    queryFn: () => gym.retention.conversion(),
    enabled: tab === "funnel",
    retry: false,
  });
  const save = useMutation({
    mutationFn: () =>
      gym.retention.addFollowUp({
        memberId: target.member?._id,
        enquiryId: target.enquiry?._id,
        kind: target.type,
        outcome,
        note: note || undefined,
        nextFollowUpAt: next || undefined,
      }),
    onSuccess: () => {
      notify.success("Follow-up saved");
      setTarget(null);
      setNote("");
      setNext("");
      setOutcome("contacted");
      qc.invalidateQueries({ queryKey: ["retention"] });
    },
    onError: (e: any) => notify.error("Could not save", e.message),
  });

  const summary = list.data?.summary;
  const rows: any[] = (list.data?.data || []).filter(
    (r: any) => tab === "all" || r.type === tab,
  );
  const count = (t: string) => summary?.byType?.[t];

  return (
    <AppLayout title="Follow-ups & Revenue Recovery">
      <StatGrid>
        <StatCard
          label="To chase today"
          value={summary?.open ?? "—"}
          icon={PhoneCall}
          color="#024BAB"
          sub={summary ? `${summary.snoozed} resting` : undefined}
        />
        <StatCard
          label="Unpaid (invoiced)"
          value={summary ? inr(summary.pendingAmount) : "—"}
          icon={IndianRupee}
          color="#EF4444"
          sub="already billed, not collected"
        />
        <StatCard
          label="Renewal potential"
          value={summary ? inr(summary.projectedAmount) : "—"}
          icon={TrendingUp}
          color="#14B8A6"
          sub="projected — not revenue"
        />
        <StatCard
          label="At-risk members"
          value={count("at_risk") ?? 0}
          icon={HeartPulse}
          color="#FA731C"
          sub="paying but not visiting"
        />
      </StatGrid>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <Tabs
          tabs={TABS.map((t) => ({
            ...t,
            count:
              t.id === "all"
                ? summary?.open
                : t.id === "funnel"
                  ? undefined
                  : (count(t.id) ?? 0),
          }))}
          value={tab}
          onChange={setTab}
        />
        {tab !== "funnel" && (
          <label className="mb-5 flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={snoozed}
              onChange={(e) => setSnoozed(e.target.checked)}
            />{" "}
            Show resting / closed
          </label>
        )}
      </div>

      {tab === "funnel" ? (
        <Funnel q={funnel} />
      ) : (
        <DataTable
          head={["Who", "What", "Value", "Last contact", ""]}
          loading={list.isLoading}
          empty={!rows.length}
          colSpan={5}
        >
          {rows.map((r, i) => {
            const who = r.member || r.enquiry;
            const link = waLink(
              who?.phone,
              (REMINDER[r.type] || (() => ""))(
                who?.name,
                r.title.charAt(0).toLowerCase() + r.title.slice(1),
              ),
            );
            return (
              <Tr key={r.key} i={i}>
                <Td>
                  <p className="font-black">{who?.name}</p>
                  <p className="text-xs text-black/50">
                    {who?.memberCode || who?.phone}
                  </p>
                </Td>
                <Td>
                  <span className="nb-badge nb-tag-blue mr-2 capitalize">
                    {titleCase(r.type)}
                  </span>
                  <span className="text-xs font-bold">{r.title}</span>
                  {r.overdue && (
                    <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-600" />
                  )}
                </Td>
                <Td className="text-xs font-black">
                  {r.pending ? (
                    <span className="text-red-600">{inr(r.pending)} due</span>
                  ) : r.projected ? (
                    <span className="text-black/60">≈ {inr(r.projected)}</span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-xs">
                  {r.lastFollowUp ? (
                    <>
                      <p className="font-bold capitalize">
                        {titleCase(r.lastFollowUp.outcome)} ·{" "}
                        {fmtDate(r.lastFollowUp.at)}
                      </p>
                      {r.lastFollowUp.note && (
                        <p className="text-black/50">{r.lastFollowUp.note}</p>
                      )}
                      {r.snoozed && (
                        <p className="font-bold text-[#14B8A6]">
                          Resting
                          {r.lastFollowUp.nextFollowUpAt
                            ? ` until ${fmtDate(r.lastFollowUp.nextFollowUpAt)}`
                            : ""}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-black/40">Not contacted</span>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    {link && who?.whatsappOptIn !== false && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        title="Opens WhatsApp with a drafted message. You send it yourself."
                        className="nb-btn flex items-center gap-1 bg-[#25D366] px-2.5 py-1.5 text-[11px] text-black"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    )}
                    <Btn onClick={() => setTarget(r)}>Log</Btn>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      )}

      <Modal
        open={!!target}
        title="Log follow-up"
        subtitle={
          target
            ? `${(target.member || target.enquiry)?.name} — ${target.title}`
            : undefined
        }
        onClose={() => setTarget(null)}
        footer={
          <Btn onClick={() => save.mutate()} busy={save.isPending}>
            Save
          </Btn>
        }
      >
        <div className="space-y-3">
          <SelectInput
            label="Outcome"
            value={outcome}
            onChange={setOutcome}
            options={OUTCOMES}
            required
          />
          <TextArea
            label="Note"
            value={note}
            onChange={(e: any) => setNote(e.target.value)}
            maxLength={500}
            placeholder="What did they say?"
          />
          <TextInput
            label="Chase again on"
            type="date"
            value={next}
            onChange={(e: any) => setNext(e.target.value)}
            hint="Leave empty to rest this item for 2 days. 'Not interested' closes it."
          />
        </div>
      </Modal>
    </AppLayout>
  );
}

function Funnel({ q }: { q: any }) {
  if (q.isLoading) return <p className="text-sm font-bold">Loading…</p>;
  if (q.isError)
    return (
      <p className="text-sm font-bold text-red-600">
        Lead funnel is available to owners, managers and accountants.
      </p>
    );
  const d = q.data?.data;
  if (!d) return null;
  const table = (title: string, key: "source" | "staff", rows: any[]) => (
    <Panel title={title}>
      <DataTable
        head={[titleCase(key), "Leads", "Joined", "Lost", "Conversion"]}
        empty={!rows.length}
        colSpan={5}
      >
        {rows.map((r, i) => (
          <Tr key={r[key]} i={i}>
            <Td className="font-bold capitalize">{titleCase(r[key])}</Td>
            <Td>{r.total}</Td>
            <Td>{r.converted}</Td>
            <Td>{r.lost}</Td>
            <Td className="font-black">{r.rate}%</Td>
          </Tr>
        ))}
      </DataTable>
    </Panel>
  );
  return (
    <div className="space-y-5">
      <StatGrid cols={3}>
        <StatCard
          label="Follow-ups overdue"
          value={d.followUpsOverdue}
          icon={CalendarClock}
          color={d.followUpsOverdue ? "#EF4444" : "#14B8A6"}
          sub="open enquiries past their date"
        />
        <StatCard
          label="Period"
          value={`${fmtDate(d.from)} – ${fmtDate(d.to)}`}
          icon={Repeat}
          color="#024BAB"
          sub="last 90 days"
        />
      </StatGrid>
      <div className="grid gap-5 lg:grid-cols-2">
        {table("By source", "source", d.bySource)}
        {table("By staff", "staff", d.byStaff)}
      </div>
      <Panel title="Why leads were lost">
        {d.lostReasons.length ? (
          <ul className="space-y-1 text-sm font-bold">
            {d.lostReasons.map((l: any) => (
              <li key={l.reason} className="flex justify-between">
                <span className="capitalize">{titleCase(l.reason)}</span>
                <span>{l.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs font-bold uppercase text-black/40">
            No lost leads
          </p>
        )}
      </Panel>
    </div>
  );
}
