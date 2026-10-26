import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request, settingsAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { useNavigate } from "react-router-dom";
import { creditsAPI } from "@/services/api";
import { fmtCredits, useCredits } from "@/contexts/CreditsContext";

const box = "border-2 border-black bg-white p-5 space-y-3";
const KINDS = [
  { key: "expiring", label: "Plan expiring in 3 days" },
  { key: "expired", label: "Plan expired in the last 3 days (not renewed)" },
  { key: "birthday", label: "Birthday wishes" },
] as const;

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

  const toggle = async (key: string, value: boolean) => {
    try {
      await settingsAPI.update({ reminders: { expiring: false, expired: false, birthday: false, ...on, [key]: value } });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <>
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
      <section className={box}>
        <h3 className="font-display font-bold text-lg">Automatic WhatsApp reminders</h3>
        {KINDS.map((k) => (
          <label key={k.key} className="flex items-center gap-3 text-sm font-bold cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#024BAB]" checked={!!on[k.key]} onChange={(e) => toggle(k.key, e.target.checked)} />
            {k.label}
          </label>
        ))}
        <p className="text-xs text-gray-600">Sent once per member from NestGym&apos;s WhatsApp number. Members who opted out of WhatsApp are skipped.</p>
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
