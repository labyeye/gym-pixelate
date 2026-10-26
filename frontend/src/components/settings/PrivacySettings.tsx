import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request, settingsAPI } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";

const box = "border-2 border-black bg-white p-5 space-y-3";
const input = "border-2 border-black w-full px-3 py-2.5 text-sm font-medium outline-none";
const btn = "border-2 border-black bg-[#024BAB] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50";

// Owner settings for the member waiver text and how long old members' personal data is kept.
export default function PrivacySettings() {
  const notify = useNotify();
  const qc = useQueryClient();
  const waiver = useQuery({ queryKey: ["waiver-tpl"], queryFn: async () => (await request<any>("/privacy/waiver")).data });
  const settings = useQuery({ queryKey: ["settings"], queryFn: async () => (await settingsAPI.get()).data });
  const [text, setText] = useState("");
  const [months, setMonths] = useState("0");
  useEffect(() => setText(waiver.data?.body || ""), [waiver.data]);
  useEffect(() => setMonths(String(settings.data?.retentionMonths ?? 0)), [settings.data]);

  const save = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      qc.invalidateQueries({ queryKey: ["waiver-tpl"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  return (
    <section className={box}>
      <h3 className="font-display font-bold text-lg">Waiver &amp; data retention</h3>
      <textarea className={input} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Liability waiver / PAR-Q text members accept at joining" />
      <p className="text-xs text-gray-600">Changing the wording asks every member to sign again (currently v{waiver.data?.version ?? "-"}).</p>
      <button className={btn} disabled={text.trim().length < 20} onClick={() => save(() => request("/privacy/waiver", { method: "PUT", body: JSON.stringify({ body: text }) }), "Waiver saved")}>
        Save waiver
      </button>
      <div className="pt-2 border-t-2 border-black/10 flex items-end gap-3 flex-wrap">
        <label className="text-xs font-bold uppercase tracking-wider">
          Erase personal data of members this many months after their last plan ends (0 = never)
          <input className={`${input} mt-1 max-w-[140px]`} type="number" min={0} max={120} value={months} onChange={(e) => setMonths(e.target.value)} />
        </label>
        <button className={btn} onClick={() => save(() => settingsAPI.update({ retentionMonths: Number(months) || 0 }), "Retention saved")}>
          Save
        </button>
      </div>
    </section>
  );
}
