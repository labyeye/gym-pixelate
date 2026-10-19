import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Camera, Loader2, RotateCcw } from "lucide-react";
import { faceService } from "@/services/faceService";
import { useNotify } from "@/components/ui/Notification";

interface FaceCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  onRegistered: () => void;
}

export function FaceCaptureModal({
  open,
  onOpenChange,
  memberId,
  onRegistered,
}: FaceCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
      setCapturedUrl(null);
      setCapturedBlob(null);
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      notify.error("Camera Error", "Unable to access webcam.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
      }
    }, "image/jpeg");
  }

  function handleRetake() {
    setCapturedUrl(null);
    setCapturedBlob(null);
  }

  async function handleSave() {
    if (!capturedBlob) return;
    try {
      setSaving(true);
      const res = await faceService.register(memberId, capturedBlob);
      if (res.success) {
        notify.success("Face Registered", "Member's face has been registered.");
        onRegistered();
        onOpenChange(false);
      }
    } catch (error: any) {
      notify.error("Registration Failed", error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-black p-0 gap-0">
        <DialogHeader className="border-b-2 border-black bg-[#024BAB] px-5 py-4">
          <DialogTitle className="text-white font-black uppercase tracking-wider text-base">
            Register Face
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 bg-white">
          <div className="border-2 border-black bg-black aspect-video overflow-hidden relative">
            {capturedUrl ? (
              <img
                src={capturedUrl}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <DialogFooter className="border-t-2 border-black px-5 py-3 flex gap-2 bg-white">
          {capturedUrl ? (
            <>
              <button
                onClick={handleRetake}
                className="nb-btn bg-white text-black px-4 py-2 text-sm flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Retake
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </>
          ) : (
            <button
              onClick={handleCapture}
              className="nb-btn bg-[#024BAB] text-white px-5 py-2 text-sm flex items-center gap-2 w-full justify-center"
            >
              <Camera className="w-4 h-4" /> Capture
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
