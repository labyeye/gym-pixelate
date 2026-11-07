import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LocateFixed, Trash2 } from "lucide-react";
import { settingsAPI } from "@/services/api";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";

const box = "border-2 border-black bg-white p-5 space-y-3";
const input =
  "border-2 border-black w-full px-3 py-2 text-sm font-medium outline-none";

// Owner rules for attendance: GPS fence + selfie face check for self check-in, and biometric terminals that push punches.
export default function AttendanceSettings() {
  const notify = useNotify();
  const qc = useQueryClient();
  const s = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await settingsAPI.get()).data,
  });
  const devices = useQuery({
    queryKey: ["att-devices"],
    queryFn: async () => (await gym.attendance.devices()).data as any[],
  });
  const [g, setG] = useState({
    enabled: false,
    requireFace: false,
    lat: "",
    lng: "",
    radiusMeters: "200",
  });
  const [saving, setSaving] = useState(false);
  const [dev, setDev] = useState({ name: "", serialNumber: "" });

  useEffect(() => {
    const a = s.data?.attendanceGeo;
    if (a)
      setG({
        enabled: !!a.enabled,
        requireFace: !!a.requireFace,
        lat: a.lat ?? "",
        lng: a.lng ?? "",
        radiusMeters: String(a.radiusMeters ?? 200),
      });
  }, [s.data]);

  const useHere = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        setG((x) => ({
          ...x,
          lat: p.coords.latitude.toFixed(6),
          lng: p.coords.longitude.toFixed(6),
        })),
      () => notify.error("Failed", "Allow location access in the browser"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  const save = async () => {
    setSaving(true);
    try {
      await settingsAPI.update({ attendanceGeo: g });
      notify.success("Saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    } finally {
      setSaving(false);
    }
  };
  const addDevice = async () => {
    try {
      await gym.attendance.addDevice(dev);
      setDev({ name: "", serialNumber: "" });
      qc.invalidateQueries({ queryKey: ["att-devices"] });
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };

  const Toggle = ({
    k,
    label,
    desc,
  }: {
    k: "enabled" | "requireFace";
    label: string;
    desc: string;
  }) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 w-4 h-4"
        checked={g[k]}
        onChange={(e) => setG({ ...g, [k]: e.target.checked })}
      />
      <span>
        <span className="block font-bold text-sm">{label}</span>
        <span className="block text-xs text-gray-600">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="mt-8 grid gap-4 max-w-3xl">
      <section className={box}>
        <h3 className="font-display font-bold text-lg">Self check-in rules</h3>
        <p className="text-xs text-gray-600">
          Applies when trainers and staff check in from their own phone. Desk
          and kiosk check-ins are not affected.
        </p>
        <Toggle
          k="enabled"
          label="Location (GPS) check-in"
          desc="Capture where they checked in. With a gym location below, check-in is allowed only inside the radius."
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold uppercase tracking-wider">
            Latitude
            <input
              className={input}
              value={g.lat}
              onChange={(e) => setG({ ...g, lat: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">
            Longitude
            <input
              className={input}
              value={g.lng}
              onChange={(e) => setG({ ...g, lng: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">
            Allowed radius (metres)
            <input
              className={input}
              type="number"
              min={20}
              max={5000}
              value={g.radiusMeters}
              onChange={(e) => setG({ ...g, radiusMeters: e.target.value })}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={useHere}
              className="border-2 border-black px-3 py-2 text-sm font-bold flex items-center gap-1.5 bg-white"
            >
              <LocateFixed className="w-4 h-4" /> Use my current location
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Open this page at the gym and tap &ldquo;Use my current
          location&rdquo;. Leave latitude/longitude empty to only record the
          location.
        </p>
        <Toggle
          k="requireFace"
          label="Selfie face check"
          desc="A selfie must match the enrolled face (Attendance → Face & device ID) to check in or out."
        />
        <button
          onClick={save}
          disabled={saving}
          className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          attendance rules
        </button>
      </section>

      <section className={box}>
        <h3 className="font-display font-bold text-lg">Biometric devices</h3>
        <p className="text-xs text-gray-600">
          ZKTeco / eSSL fingerprint or face terminals. On the device set{" "}
          <b>Cloud Server / ADMS</b> to this server&apos;s address (path{" "}
          <code>/iclock</code>), then register its serial number here. Give each
          person the same <b>Biometric ID</b> they have on the device
          (Attendance → Face &amp; device ID).
        </p>
        {(devices.data || []).map((d: any) => (
          <div
            key={d._id}
            className="flex items-center justify-between border-2 border-gray-200 p-3"
          >
            <div>
              <p className="font-bold text-sm">
                {d.name}{" "}
                <span className="text-xs text-gray-500">
                  · {d.serialNumber}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                {d.lastSeenAt
                  ? `Last seen ${new Date(d.lastSeenAt).toLocaleString("en-IN")}`
                  : "Never connected"}
              </p>
            </div>
            <button
              aria-label="Remove device"
              onClick={async () => {
                if (window.confirm(`Remove ${d.name}?`)) {
                  await gym.attendance.removeDevice(d._id);
                  qc.invalidateQueries({ queryKey: ["att-devices"] });
                }
              }}
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        ))}
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <label className="text-xs font-bold uppercase tracking-wider">
            Name
            <input
              className={input}
              placeholder="Front door"
              value={dev.name}
              onChange={(e) => setDev({ ...dev, name: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider">
            Serial number
            <input
              className={input}
              value={dev.serialNumber}
              onChange={(e) => setDev({ ...dev, serialNumber: e.target.value })}
            />
          </label>
          <button
            onClick={addDevice}
            disabled={!dev.name || !dev.serialNumber}
            className="nb-btn bg-[#024BAB] text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Add device
          </button>
        </div>
      </section>
    </div>
  );
}
