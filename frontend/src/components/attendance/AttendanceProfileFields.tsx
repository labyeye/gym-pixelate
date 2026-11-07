import { useState } from "react";
import { LocateFixed, ScanFace } from "lucide-react";
import { gym } from "@/services/gymApi";
import { useNotify } from "@/components/ui/Notification";
import { cn } from "@/lib/utils";
import FaceCapture from "./FaceCapture";

// The "Attendance" tab of the trainer / staff form, laid out like NestHR's employee form:
// Work schedule, Shift, Biometric ID + face, and per-person Mobile Geofenced Attendance.
export interface AttProfile {
  workDaysPerWeek: string;
  workScheduleType: "standard" | "custom";
  customWorkDays: number[];
  shiftStart: string;
  shiftEnd: string;
  geofence: { enabled: boolean; mode: "specific" | "any"; lat: string; lng: string; radiusMeters: string };
  biometricId: string;
}
export const emptyProfile: AttProfile = {
  workDaysPerWeek: "6",
  workScheduleType: "standard",
  customWorkDays: [],
  shiftStart: "",
  shiftEnd: "",
  geofence: { enabled: false, mode: "specific", lat: "", lng: "", radiusMeters: "200" },
  biometricId: "",
};
export const profileOf = (u: any): AttProfile => {
  const p = u?.attendanceProfile || {};
  const g = p.geofence || {};
  return {
    workDaysPerWeek: String(p.workDaysPerWeek || 6),
    workScheduleType: p.workScheduleType === "custom" ? "custom" : "standard",
    customWorkDays: p.customWorkDays || [],
    shiftStart: p.shiftStart || "",
    shiftEnd: p.shiftEnd || "",
    geofence: { enabled: !!g.enabled, mode: g.mode === "any" ? "any" : "specific", lat: g.lat ?? "", lng: g.lng ?? "", radiusMeters: String(g.radiusMeters || 200) },
    biometricId: u?.biometricId || "",
  };
};
export const saveProfile = (id: string, v: AttProfile) =>
  gym.attendance.saveProfile(id, { biometricId: v.biometricId, attendanceProfile: { ...v, workDaysPerWeek: Number(v.workDaysPerWeek) } });

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const head = "text-xs font-bold uppercase tracking-wider text-[#024BAB] mb-1";
const field = "border-2 border-black w-full px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#024BAB]/30";
const lab = "block text-xs font-bold text-black mb-1";

export default function AttendanceProfileFields({ value: v, onChange, personId, faceEnrolled }: { value: AttProfile; onChange: (v: AttProfile) => void; personId?: string; faceEnrolled?: boolean }) {
  const notify = useNotify();
  const [cam, setCam] = useState(false);
  const [enrolled, setEnrolled] = useState(!!faceEnrolled);
  const set = (p: Partial<AttProfile>) => onChange({ ...v, ...p });
  const setGeo = (p: Partial<AttProfile["geofence"]>) => onChange({ ...v, geofence: { ...v.geofence, ...p } });
  const here = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => notify.error("Failed", "Allow location access in the browser"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  const enroll = async (photo: Blob | null) => {
    setCam(false);
    if (!photo || !personId) return;
    try {
      await gym.attendance.enroll("staff", { id: personId }, photo);
      setEnrolled(true);
      notify.success("Face enrolled");
    } catch (e: any) {
      notify.error("Failed", e.message);
    }
  };
  const optBtn = (on: boolean) => cn("flex-1 py-4 border-2 border-black text-sm font-bold transition-colors", on ? "bg-[#024BAB] text-white" : "bg-white text-black hover:bg-[#024BAB]/5");

  return (
    <div className="space-y-6">
      <div>
        <p className={head}>Work Schedule</p>
        <p className="text-xs text-gray-500 mb-3">How many days per week does this person work? Other days show as weekly off, not as &ldquo;not checked in&rdquo;.</p>
        <div className="flex gap-3 flex-wrap">
          {[{ val: "5", label: "5 Days", sub: "Mon – Fri" }, { val: "6", label: "6 Days", sub: "Mon – Sat" }, { val: "7", label: "7 Days", sub: "Mon – Sun" }].map((o) => (
            <button key={o.val} type="button" onClick={() => set({ workDaysPerWeek: o.val, workScheduleType: "standard", customWorkDays: [] })} className={optBtn(v.workScheduleType === "standard" && v.workDaysPerWeek === o.val)}>
              <div className="text-lg font-bold">{o.label}</div>
              <div className="text-xs font-normal opacity-70">{o.sub}</div>
            </button>
          ))}
          <button type="button" onClick={() => set({ workScheduleType: "custom" })} className={optBtn(v.workScheduleType === "custom")}>
            <div className="text-lg font-bold">Custom</div>
            <div className="text-xs font-normal opacity-70">Pick days</div>
          </button>
        </div>
        {v.workScheduleType === "custom" && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {DAYS.map((d, i) => {
              const on = v.customWorkDays.includes(i);
              return (
                <button key={d} type="button" onClick={() => set({ customWorkDays: on ? v.customWorkDays.filter((x) => x !== i) : [...v.customWorkDays, i] })} className={cn("px-3 py-2 border-2 border-black text-xs font-bold", on ? "bg-[#024BAB] text-white" : "bg-white")}>
                  {d}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className={head}>Shift</p>
        <p className="text-xs text-gray-500 mb-3">Check-in more than 15 minutes after the start is marked Late, more than 2 hours is a Half Day. Leave empty for no late tracking.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>Shift start</label><input type="time" className={field} value={v.shiftStart} onChange={(e) => set({ shiftStart: e.target.value })} /></div>
          <div><label className={lab}>Shift end</label><input type="time" className={field} value={v.shiftEnd} onChange={(e) => set({ shiftEnd: e.target.value })} /></div>
        </div>
      </div>

      <div>
        <p className={head}>Biometric &amp; Face</p>
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className={lab}>Biometric ID (number on the device)</label>
            <input inputMode="numeric" className={field} value={v.biometricId} onChange={(e) => set({ biometricId: e.target.value.replace(/[^0-9]/g, "") })} placeholder="e.g. 12" />
          </div>
          <div>
            {personId ? (
              <button type="button" onClick={() => setCam(true)} className="border-2 border-black px-3 py-2.5 text-sm font-bold flex items-center gap-1.5 bg-white w-full justify-center">
                <ScanFace className="w-4 h-4" /> {enrolled ? "Re-enroll face" : "Enroll face"}
              </button>
            ) : (
              <p className="text-xs text-gray-500">Face can be enrolled after saving.</p>
            )}
          </div>
        </div>
        {enrolled && <p className="text-xs font-bold text-[#00C48C] mt-1">Face enrolled</p>}
      </div>

      <div>
        <p className={head}>Mobile Geofenced Attendance</p>
        <label className="flex items-center gap-2 text-sm font-bold mb-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={v.geofence.enabled} onChange={(e) => setGeo({ enabled: e.target.checked })} />
          Use this person&apos;s own location rule (otherwise the gym-wide rule in Settings applies)
        </label>
        {v.geofence.enabled && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <button type="button" onClick={() => setGeo({ mode: "specific" })} className={optBtn(v.geofence.mode === "specific")}>Specific location</button>
              <button type="button" onClick={() => setGeo({ mode: "any" })} className={optBtn(v.geofence.mode === "any")}>Any location</button>
            </div>
            {v.geofence.mode === "specific" && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lab}>Latitude</label><input className={field} value={v.geofence.lat} onChange={(e) => setGeo({ lat: e.target.value })} /></div>
                <div><label className={lab}>Longitude</label><input className={field} value={v.geofence.lng} onChange={(e) => setGeo({ lng: e.target.value })} /></div>
                <div><label className={lab}>Radius (metres)</label><input type="number" min={20} max={5000} className={field} value={v.geofence.radiusMeters} onChange={(e) => setGeo({ radiusMeters: e.target.value })} /></div>
                <div className="flex items-end"><button type="button" onClick={here} className="border-2 border-black px-3 py-2.5 text-sm font-bold flex items-center gap-1.5 bg-white"><LocateFixed className="w-4 h-4" /> Use my current location</button></div>
              </div>
            )}
            {v.geofence.mode === "any" && <p className="text-xs text-gray-500">Check-in works from anywhere; the location is recorded for the owner to see.</p>}
          </div>
        )}
      </div>
      {cam && <FaceCapture title="Capture face to enroll" onDone={enroll} />}
    </div>
  );
}
