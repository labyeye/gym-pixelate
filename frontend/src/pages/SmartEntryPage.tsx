import { useEffect, useRef, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { faceService } from "@/services/faceService";
import {
  ScanFace,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ResultState =
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "success"; name: string; note?: string }
  | { kind: "expired"; name: string; reason?: string }
  | { kind: "denied" };

export default function SmartEntryPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ResultState>({ kind: "scanning" });

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      // camera unavailable, ignore
    }
  }

  const resetToScanning = useCallback(() => {
    setState({ kind: "scanning" });
  }, []);

  async function handleScan() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

    setState({ kind: "checking" });

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const res = await faceService.verify(blob);
        // the API answers { success, data: { matched, membershipActive, member, reason, warnings } }
        const d: any = res.data;
        if (d?.matched) {
          const name = d.member?.name || "Member";
          if (d.membershipActive) {
            setState({
              kind: "success",
              name,
              note: d.alreadyInside
                ? "Already checked in"
                : (d.warnings || []).join(" · "),
            });
          } else {
            setState({ kind: "expired", name, reason: d.reason });
          }
        } else {
          setState({ kind: "denied" });
        }
      } catch {
        setState({ kind: "denied" });
      } finally {
        setTimeout(resetToScanning, 4000);
      }
    }, "image/jpeg");
  }

  return (
    <AppLayout title="Smart Entry">
      <div className="border-2 border-black bg-white nb-shadow-lg overflow-hidden relative min-h-[70vh] flex items-center justify-center">
        {state.kind === "scanning" || state.kind === "checking" ? (
          <div className="w-full max-w-xl p-6 flex flex-col items-center gap-5">
            <div className="border-2 border-black bg-black aspect-video w-full overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button
              onClick={handleScan}
              disabled={state.kind === "checking"}
              className="nb-btn bg-[#A855F7] text-white px-8 py-3 text-base flex items-center gap-2 disabled:opacity-60"
            >
              {state.kind === "checking" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Verifying...
                </>
              ) : (
                <>
                  <ScanFace className="w-5 h-5" /> Scan Face
                </>
              )}
            </button>
          </div>
        ) : state.kind === "success" ? (
          <div
            className={cn(
              "absolute inset-0 bg-[#00C48C] flex flex-col items-center justify-center gap-4 text-center p-8",
            )}
          >
            <CheckCircle2 className="w-24 h-24 text-black" />
            <h2 className="font-display font-black text-4xl text-black">
              Welcome, {state.name}!
            </h2>
            <p className="text-black/70 font-bold">
              {state.note || "Access granted. Have a great workout."}
            </p>
          </div>
        ) : state.kind === "expired" ? (
          <div className="absolute inset-0 bg-[#EF4444] flex flex-col items-center justify-center gap-4 text-center p-8">
            <AlertTriangle className="w-24 h-24 text-white" />
            <h2 className="font-display font-black text-4xl text-white">
              Entry blocked
            </h2>
            <p className="text-white/80 font-bold">
              {state.name}: {state.reason || "please see the front desk."}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 bg-[#0A0A0A] flex flex-col items-center justify-center gap-4 text-center p-8">
            <XCircle className="w-24 h-24 text-white" />
            <h2 className="font-display font-black text-4xl text-white">
              Access Denied
            </h2>
            <p className="text-white/70 font-bold">
              Unknown face — not recognized in system.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
