import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { Btn, Modal, Pill } from "@/components/gym/kit";
import { waDigits } from "@/lib/countries";

// Auto-renew for one member: creates a Razorpay mandate and gives staff the link to send the member.
export default function AutopayButton({ member, membership }: { member: any; membership: any }) {
  const notify = useNotify();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["autopay", member._id],
    queryFn: async () => (await request<any>(`/autopay?memberId=${member._id}`)).data as any[],
  });
  const m = q.data?.find((x) => ["created", "authenticated", "active"].includes(x.status));
  const act = async (path: string, ok: string) => {
    setBusy(true);
    try {
      await request(path, { method: "POST" });
      notify.success(ok);
      qc.invalidateQueries({ queryKey: ["autopay", member._id] });
    } catch (e: any) {
      notify.error("Autopay", e.message);
    } finally {
      setBusy(false);
    }
  };
  const text = m && `Hi ${member.name}, set up auto-renew of your membership (Rs ${m.amount} each cycle, cancel anytime): ${m.shortUrl}`;

  return (
    <>
      <Btn light busy={busy} onClick={() => (m ? setOpen(true) : act(`/autopay/memberships/${membership._id}`, "Autopay link created").then(() => setOpen(true)))}>
        <Repeat className="w-4 h-4" /> {m ? `Autopay: ${m.status}` : "Set up autopay"}
      </Btn>
      <Modal
        open={open && !!m}
        title="Autopay"
        subtitle={m ? `Rs ${m.amount} per cycle` : ""}
        onClose={() => setOpen(false)}
        footer={
          m && (
            <>
              <Btn light onClick={() => act(`/autopay/${m._id}/cancel`, "Autopay cancelled").then(() => setOpen(false))}>
                Cancel autopay
              </Btn>
              <Btn onClick={() => window.open(`https://wa.me/${waDigits(member.phone)}?text=${encodeURIComponent(text)}`, "_blank")}>Send on WhatsApp</Btn>
            </>
          )
        }
      >
        {m && (
          <div className="space-y-3 text-sm">
            <Pill value={m.status} />
            <p>The member opens this link once and approves UPI AutoPay / card. After that, each cycle renews the membership and creates the invoice automatically.</p>
            <input readOnly className="border-2 border-black w-full px-3 py-2 text-xs" value={m.shortUrl} onFocus={(e) => e.target.select()} />
          </div>
        )}
      </Modal>
    </>
  );
}
