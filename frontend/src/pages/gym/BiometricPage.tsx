import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Fingerprint, Loader2, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { gym } from "@/services/gymApi";
import { branchService } from "@/services/branchService";
import { useNotify } from "@/components/ui/Notification";
import { cn } from "@/lib/utils";
import { Btn, SelectInput, TextInput } from "@/components/gym/kit";

// Biometric setup, organised like NestHR's Biometric page: Locations & Devices, ADMS / ESSL Sync, Activity Logs.
// A "location" is one of the gym's branches. Devices push punches to us (ZKTeco / eSSL ADMS); we never push to them.
const TABS = ["Locations & Devices", "ADMS / ESSL Sync", "Activity Logs"];
const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function BiometricPage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dev, setDev] = useState({ name: "", serialNumber: "", model: "", branchId: "" });
  const [busy, setBusy] = useState(false);
  const [serial, setSerial] = useState("");

  const devices = useQuery({ queryKey: ["att-devices"], refetchInterval: 30000, queryFn: async () => (await gym.attendance.devices()).data as any[] });
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await branchService.getAll()).data as any[] });
  const logs = useQuery({ queryKey: ["att-device-logs", serial], enabled: tab === 2, refetchInterval: tab === 2 ? 15000 : false, queryFn: async () => (await gym.attendance.deviceLogs({ serial })).data as any[] });
  const people = useQuery({
    queryKey: ["bio-people"],
    enabled: tab === 1,
    queryFn: async () => ((await gym.users.list()).data as any[]).filter((u) => u.role !== "member" && u.role !== "super_admin" && u.status !== "inactive"),
  });

  const server = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api\/?$/, "");
  const host = (() => {
    try {
      return new URL(server).host;
    } catch {
      return server;
    }
  })();

  const add = async () => {
    try {
      setBusy(true);
      await gym.attendance.addDevice(dev);
      setDev({ name: "", serialNumber: "", model: "", branchId: "" });
      qc.invalidateQueries({ queryKey: ["att-devices"] });
      notify.success("Device added");
    } catch (e: any) {
      notify.error("Failed", e.message);
    } finally {
      setBusy(false);
    }
  };
  const assign = async () => {
    try {
      setBusy(true);
      const r = await gym.attendance.assignIds();
      notify.success(r.assigned ? `${r.assigned} Biometric IDs assigned` : "Everyone already has an ID");
      qc.invalidateQueries({ queryKey: ["bio-people"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    } finally {
      setBusy(false);
    }
  };
  const list = devices.data || [];
  const byBranch = new Map<string, any[]>();
  list.forEach((d) => {
    const k = d.branchId?.name || "No location";
    byBranch.set(k, [...(byBranch.get(k) || []), d]);
  });

  return (
    <AppLayout title="Biometric">
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map((t, i) => (
          <Btn key={t} light={tab !== i} onClick={() => setTab(i)}>{t}</Btn>
        ))}
      </div>

      {tab === 0 && (
        <>
          <section className="border-2 border-black bg-white p-5 mb-5">
            <h3 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Add device</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <TextInput label="Device name" placeholder="Front door" value={dev.name} onChange={(e: any) => setDev({ ...dev, name: e.target.value })} />
              <TextInput label="Serial number" hint="Printed on the device (Menu → System Info)" value={dev.serialNumber} onChange={(e: any) => setDev({ ...dev, serialNumber: e.target.value })} />
              <TextInput label="Model" placeholder="ZKTeco K40 / eSSL" value={dev.model} onChange={(e: any) => setDev({ ...dev, model: e.target.value })} />
              <SelectInput label="Location (branch)" placeholder="No location" options={(branches.data || []).map((b: any) => ({ value: b._id, label: b.name }))} value={dev.branchId} onChange={(v: string) => setDev({ ...dev, branchId: v })} />
            </div>
            <div className="mt-3"><Btn busy={busy} disabled={!dev.name || !dev.serialNumber} onClick={add}>Add device</Btn></div>
          </section>

          {devices.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : list.length === 0 ? (
            <div className="border-2 bg-white p-12 flex flex-col items-center"><Fingerprint className="w-12 h-12 text-gray-300 mb-3" /><p className="font-bold">No devices yet</p><p className="text-sm text-gray-500">Add one above, then follow the steps in &ldquo;ADMS / ESSL Sync&rdquo;.</p></div>
          ) : (
            [...byBranch.entries()].map(([place, ds]) => (
              <div key={place} className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#024BAB] mb-2">{place}</p>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {ds.map((d) => (
                    <div key={d._id} className="border-2 border-black bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold">{d.name}</p>
                          <p className="text-xs text-gray-500">{d.model || "Biometric terminal"} · {d.serialNumber}</p>
                        </div>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold border-2", d.online ? "bg-[#00C48C]/10 text-[#00C48C] border-[#00C48C]" : "bg-gray-100 text-gray-500 border-gray-300")}>
                          {d.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />} {d.online ? "Online" : "Offline"}
                        </span>
                      </div>
                      <dl className="text-xs mt-3 space-y-1">
                        <div className="flex justify-between"><dt className="text-gray-500">Last seen</dt><dd className="font-bold">{when(d.lastSeenAt)}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Last punch received</dt><dd className="font-bold">{when(d.lastLogAt)}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">IP</dt><dd className="font-bold">{d.ip || "—"}</dd></div>
                      </dl>
                      <div className="flex justify-between mt-3">
                        <button onClick={() => { setSerial(d.serialNumber); setTab(2); }} className="text-xs font-bold text-[#024BAB] hover:underline">View logs</button>
                        <button aria-label="Remove device" onClick={async () => { if (window.confirm(`Remove ${d.name}?`)) { await gym.attendance.removeDevice(d._id); qc.invalidateQueries({ queryKey: ["att-devices"] }); } }}><Trash2 className="w-4 h-4 text-red-600" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {tab === 1 && (
        <div className="grid gap-5 max-w-4xl">
          <section className="border-2 border-black bg-white p-5 space-y-2">
            <h3 className="font-display font-bold text-lg">Connect a ZKTeco / eSSL device</h3>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              <li>Register the device&apos;s serial number in <b>Locations &amp; Devices</b>.</li>
              <li>On the device open <b>Menu → Comm. → Cloud Server Setting</b> (ADMS).</li>
              <li>Set <b>Server Address</b> to the host below, and enable the server. Keep the device&apos;s date and time on IST.</li>
              <li>Give each person a Biometric ID, then enroll their finger / face on the device under the <b>same number</b>.</li>
              <li>The device turns <b>Online</b> within a minute; every punch then becomes attendance (first punch in, next out).</li>
            </ol>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="border-2 border-black bg-gray-50 px-3 py-2 text-sm">{host}</code>
              <button onClick={() => { navigator.clipboard?.writeText(host); notify.success("Copied"); }} className="border-2 border-black px-3 py-2 text-xs font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</button>
              <span className="text-xs text-gray-500">Path <code>/iclock</code> is used automatically. If your device asks for a port, use 443 (https) or 80.</span>
            </div>
          </section>

          <section className="border-2 border-black bg-white p-5">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div>
                <h3 className="font-display font-bold text-lg">Biometric IDs</h3>
                <p className="text-xs text-gray-600">Trainers and staff. Edit a person&apos;s ID in their Attendance tab; members get theirs in Attendance → Face &amp; device ID.</p>
              </div>
              <Btn busy={busy} onClick={assign}>Auto-assign missing IDs</Btn>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-black bg-[#024BAB]/5">{["Name", "Role", "Biometric ID"].map((h) => <th key={h} className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody>
                  {(people.data || []).map((u: any, i: number) => (
                    <tr key={u._id} className={cn("border-b border-black/10", i % 2 ? "bg-[#F8FAFF]" : "")}>
                      <td className="px-4 py-2 font-bold text-xs">{u.name}</td>
                      <td className="px-4 py-2 text-xs capitalize">{u.role.replace("_", " ")}</td>
                      <td className="px-4 py-2 text-xs">{u.biometricId || <span className="text-gray-400">not set</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 2 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <select value={serial} onChange={(e) => setSerial(e.target.value)} className="border-2 border-black px-3 py-2 text-sm font-semibold bg-white">
              <option value="">All devices</option>
              {list.map((d) => <option key={d._id} value={d.serialNumber}>{d.name}</option>)}
            </select>
            <span className="text-xs text-gray-500">Latest 200 events, kept for 30 days. Refreshes every 15 seconds.</span>
          </div>
          {(logs.data || []).length === 0 ? (
            <div className="border-2 bg-white p-12 text-center text-sm text-gray-500">No device activity yet.</div>
          ) : (
            <div className="border-2 bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-black bg-[#024BAB]/5">{["Time", "Device", "Event", "Received", "Marked", "Skipped", "Details"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody>
                  {(logs.data || []).map((l: any, i: number) => (
                    <tr key={l._id} className={cn("border-b border-black/10", i % 2 ? "bg-[#F8FAFF]" : "")}>
                      <td className="px-4 py-2 text-xs whitespace-nowrap">{when(l.createdAt)}</td>
                      <td className="px-4 py-2 text-xs">{list.find((d) => d.serialNumber === l.serialNumber)?.name || l.serialNumber}</td>
                      <td className="px-4 py-2 text-xs capitalize">{l.kind}</td>
                      <td className="px-4 py-2 text-xs">{l.received ?? "—"}</td>
                      <td className="px-4 py-2 text-xs font-bold text-[#00C48C]">{l.marked ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{l.skipped ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{l.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
