import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/services/api";
import { useNotify } from "@/components/ui/Notification";
import { Btn, Panel, fmtDate } from "@/components/gym/kit";
import { useAuth } from "@/contexts/AuthContext";

// Per-member privacy tools: signed waiver, marketing consent, data export and erasure (DPDP).
export default function PrivacyPanel({ member }: { member: any }) {
  const notify = useNotify();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === "gym_owner" || user?.role === "super_admin";
  const base = `/privacy/members/${member._id}`;
  const w = useQuery({ queryKey: ["waiver", member._id], queryFn: async () => (await request<any>(`${base}/waivers`)).data });
  const done = () => qc.invalidateQueries({ queryKey: ["waiver", member._id] });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify.success(ok);
      done();
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  const last = w.data?.signed?.[0];

  return (
    <Panel title="Privacy & waiver">
      <div className="p-4 space-y-3 text-sm">
        <p className="font-bold">
          Waiver:{" "}
          {!w.data?.template
            ? "not set up (Settings → Security)"
            : w.data.upToDate
              ? `signed ${fmtDate(last.createdAt)} (v${last.version})`
              : last
                ? "wording changed, needs a new signature"
                : "not signed yet"}
        </p>
        <div className="flex flex-wrap gap-2">
          {w.data?.template && !w.data.upToDate && (
            <Btn
              onClick={() => {
                const name = window.prompt(`Member types their full name to accept the waiver:\n\n${w.data.template.body}`);
                if (name) run(() => request(`${base}/waivers`, { method: "POST", body: JSON.stringify({ signedName: name }) }), "Waiver signed");
              }}
            >
              Sign waiver
            </Btn>
          )}
          <Btn
            light
            onClick={() =>
              run(
                () => request(`${base}/consents`, { method: "POST", body: JSON.stringify({ purpose: "marketing", granted: member.whatsappOptIn === false }) }),
                "Consent saved",
              )
            }
          >
            {member.whatsappOptIn === false ? "Record marketing opt-in" : "Record marketing opt-out"}
          </Btn>
          {isOwner && (
            <>
              <Btn
                light
                onClick={() =>
                  run(async () => {
                    const r = await request<any>(`${base}/export`);
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
                    a.download = `member-${member.memberCode || member._id}.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }, "Data exported")
                }
              >
                Export data
              </Btn>
              <Btn
                color="#EF4444"
                onClick={() => {
                  const p = window.prompt("This permanently erases this member's personal data (invoices are kept). Type their phone number to confirm:");
                  if (p) run(() => request(`${base}/erase`, { method: "POST", body: JSON.stringify({ confirmPhone: p }) }), "Personal data erased").then(() => qc.invalidateQueries({ queryKey: ["member-overview", member._id] }));
                }}
              >
                Erase data
              </Btn>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
