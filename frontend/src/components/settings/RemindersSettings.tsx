import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request, settingsAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { useNavigate } from "react-router-dom";
import { creditsAPI } from "@/services/api";
import { fmtCredits, useCredits } from "@/contexts/CreditsContext";

const box = "border-2 border-black bg-white p-5 space-y-3";
const KINDS = [
  { key: "paymentLink", label: "Fee payment links", desc: "Monthly WhatsApp link to pay an outstanding invoice online.", def: true },
  { key: "expiring", label: "Plan expiring in 3 days", desc: "Reminds the member to renew before the plan ends.", def: false },
  { key: "expired", label: "Plan expired (not renewed)", desc: "Follow-up in the 3 days after the plan ended.", def: false },
  { key: "birthday", label: "Birthday wishes", desc: "A wish on the member's birthday. Costs more credits.", def: false },
] as const;

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`w-10 h-5 border-2 border-black relative transition-colors shrink-0 ${on ? "bg-[#024BAB]" : "bg-gray-300"}`}
    >
      <span className={`absolute top-0.5 w-3 h-3 bg-white border border-black transition-all ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

// Owner switches for automatic member WhatsApp reminders, plus the last messages that went out.
export default function RemindersSettings() {
  const notify = useNotify();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: async () => (await settingsAPI.get()).data });
  const log = useQuery({ queryKey: ["reminder-log"], queryFn: async () => (await request<any>("/reminders/log")).data as any[] });
  const on = s.data?.reminders || {};
  const { credits } = useCredits();
  const navigate = useNavigate();
  const est = useQuery({ queryKey: ["credits-estimate"], enabled: !!credits?.metered, queryFn: async () => (await creditsAPI.estimate()).data });

  const enabled = s.data?.whatsappEnabled !== false;
  const setEnabled = async (value: boolean) => {
    try {
      await settingsAPI.update({ whatsappEnabled: value });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  const toggle = async (key: string, value: boolean) => {
    try {
      await settingsAPI.update({ reminders: { paymentLink: true, expiring: false, expired: false, birthday: false, ...on, [key]: value } });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <>
      <section className={`${box} mb-3 flex-row`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-sm text-black">Enable WhatsApp messages to members</p>
            <p className="text-xs text-gray-600 mt-0.5">Master switch. When off, no WhatsApp message is sent to your members, whatever is chosen below.</p>
          </div>
          <Switch on={enabled} onClick={() => setEnabled(!enabled)} />
        </div>
      </section>
      <section className="border-2 border-[#024BAB]/30 bg-[#F0F7FF] p-4 mb-3 text-xs text-gray-700 space-y-1">
        <p className="font-bold text-[#024BAB] text-sm">Powered by NestGym WhatsApp Service</p>
        <p>Messages go from NestGym&apos;s verified WhatsApp Business number. No setup needed. Members who opted out of WhatsApp are skipped. Login OTPs are always free.</p>
        <p className="text-gray-500">Member phone numbers need a country code (for example 919876543210).</p>
      </section>
      {credits?.metered && (
        <section className={`${box} mb-3 ${credits.zero ? "bg-red-50" : "bg-[#F0FFF8]"}`}>
          <h3 className="font-display font-bold text-lg">
            WhatsApp credits: {fmtCredits(credits.total)}
            {credits.zero && " (messages paused)"}
          </h3>
          <p className="text-xs text-gray-600">
            Each reminder or payment link costs {credits.rates?.reminder ?? credits.ratePerMessage} credit; a birthday wish costs{" "}
            {credits.rates?.birthday ?? 1}. Messages stop when credits run out and resume after a top-up.
          </p>
          {est.data && est.data.credits > 0 && (
            <p className="text-xs text-gray-600">
              With what is on the books now: about <b>{fmtCredits(est.data.credits)}</b> credits ({est.data.expiringSoon} expiring soon, {est.data.recentlyExpired} just expired,{" "}
              {est.data.outstandingInvoices} payment links, {est.data.birthdaysThisMonth} birthdays this month).
            </p>
          )}
          <button onClick={() => navigate("/credits")} className="text-xs font-bold text-[#024BAB] hover:underline">
            Add credits &amp; see usage
          </button>
        </section>
      )}
      <section className={`${box} ${enabled ? "" : "opacity-60"}`}>
        <h3 className="font-display font-bold text-lg">Notification events</h3>
        {KINDS.map((k) => (
          <div key={k.key} className="flex items-center justify-between gap-3 p-3 border-2 border-gray-200 bg-white">
            <div>
              <p className="font-bold text-sm text-black">{k.label}</p>
              <p className="text-xs text-gray-500">{k.desc}</p>
            </div>
            <Switch on={on[k.key] ?? k.def} onClick={() => toggle(k.key, !(on[k.key] ?? k.def))} />
          </div>
        ))}
        <p className="text-xs text-gray-600">Each message goes to the member and uses credits. Sent once per member.</p>
      </section>
      <section className={`${box} mt-3`}>
        <h3 className="font-display font-bold text-lg">Referral reward</h3>
        <label className="text-xs font-bold uppercase tracking-wider block">
          Rs credited to the referrer&apos;s wallet when a referred member buys their first plan (0 = off)
          <input
            className="border-2 border-black w-full max-w-[160px] mt-1 px-3 py-2.5 text-sm font-medium outline-none"
            type="number"
            min={0}
            key={s.data?.referralReward}
            defaultValue={s.data?.referralReward ?? 0}
            onBlur={async (e) => {
              try {
                await settingsAPI.update({ referralReward: Number(e.target.value) || 0 });
                notify.success("Saved");
                qc.invalidateQueries({ queryKey: ["settings"] });
              } catch (err: any) {
                notify.error("Failed", err.message);
              }
            }}
          />
        </label>
      </section>
      <section className={`${box} mt-3`}>
        <h3 className="font-display font-bold text-lg">Recent reminders</h3>
        {!log.data?.length ? (
          <p className="text-sm text-gray-600">Nothing sent yet.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {log.data.map((r) => (
                <tr key={r._id} className="border-t border-black/10">
                  <td className="py-1.5">{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                  <td className="font-bold uppercase">{r.kind}</td>
                  <td>{r.memberId?.name || "-"}</td>
                  <td className={r.status === "failed" ? "text-red-600 font-bold" : ""}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
