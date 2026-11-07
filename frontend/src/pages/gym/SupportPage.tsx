import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import {
  Btn,
  DataTable,
  Modal,
  Pill,
  SelectInput,
  Td,
  TextArea,
  TextInput,
  Tr,
} from "@/components/gym/kit";

const empty = { subject: "", description: "", priority: "medium" };

export default function SupportPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<any>(null);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const sendReply = async () => {
    try {
      const r = await request<any>(`/support/${view._id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: reply }),
      });
      setView(r.data);
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (e: any) {
      notify.error("Could not send", e.message);
    }
  };
  const { data, isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => request<any>("/support"),
  });
  const tickets: any[] = data?.data || [];

  const submit = async () => {
    setBusy(true);
    try {
      await request("/support", { method: "POST", body: JSON.stringify(f) });
      notify.success("Ticket raised", "Our team will reply here.");
      setOpen(false);
      setF(empty);
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (e: any) {
      notify.error("Could not raise ticket", e.message);
    }
    setBusy(false);
  };

  return (
    <AppLayout title="Support">
      <div className="flex justify-end mb-5">
        <Btn onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Raise ticket
        </Btn>
      </div>
      <DataTable
        head={["Ticket", "Subject", "Priority", "Status", "Raised", "Replies"]}
        loading={isLoading}
        empty={tickets.length === 0}
      >
        {tickets.map((t, i) => (
          <Tr key={t._id} i={i} onClick={() => setView(t)}>
            <Td className="font-black">{t.ticketId}</Td>
            <Td className="font-bold">{t.subject}</Td>
            <Td>
              <Pill value={t.priority} />
            </Td>
            <Td>
              <Pill value={t.status} />
            </Td>
            <Td className="text-xs">
              {new Date(t.createdAt).toLocaleDateString()}
            </Td>
            <Td className="font-bold">{t.replies?.length || 0}</Td>
          </Tr>
        ))}
      </DataTable>

      <Modal
        open={open}
        title="Raise ticket"
        subtitle="Tell us what went wrong. We reply right here."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn light onClick={() => setOpen(false)}>
              Cancel
            </Btn>
            <Btn
              onClick={submit}
              disabled={busy || !f.subject.trim() || !f.description.trim()}
            >
              {busy ? "Sending…" : "Submit"}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Subject"
            required
            value={f.subject}
            onChange={(e: any) => setF({ ...f, subject: e.target.value })}
          />
          <SelectInput
            label="Priority"
            value={f.priority}
            onChange={(v: string) => setF({ ...f, priority: v })}
            options={["low", "medium", "high", "critical"]}
          />
          <TextArea
            label="Description"
            rows={5}
            value={f.description}
            onChange={(e: any) => setF({ ...f, description: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        open={!!view}
        title={view?.ticketId || "Ticket"}
        subtitle={view?.subject}
        onClose={() => setView(null)}
      >
        {view && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2">
              <Pill value={view.priority} />
              <Pill value={view.status} />
            </div>
            <p className="whitespace-pre-wrap font-medium">
              {view.description}
            </p>
            {(view.replies || []).map((r: any) => (
              <div key={r._id} className="border-2 border-black p-3">
                <p className="text-xs font-black uppercase">
                  {r.senderName || r.from}
                </p>
                <p className="whitespace-pre-wrap">{r.message}</p>
              </div>
            ))}
            <TextArea
              label="Add a reply"
              rows={3}
              value={reply}
              onChange={(e: any) => setReply(e.target.value)}
            />
            <Btn onClick={sendReply} disabled={!reply.trim()}>
              Send reply
            </Btn>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
