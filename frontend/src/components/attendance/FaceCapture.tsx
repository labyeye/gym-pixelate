import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Btn } from "@/components/gym/kit";

// Opens the camera, takes one photo and hands it back as a JPEG blob (used for selfie check-in and face enrolment).
// The server works out the face from the photo, so nothing is detected here. Cancel gives null.
export default function FaceCapture({
  title = "Take a photo",
  onDone,
}: {
  title?: string;
  onDone: (photo: Blob | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        if (dead) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current
            .play()
            .then(() => setReady(true))
            .catch(() => {});
        }
      })
      .catch(() =>
        setErr("Camera not available. Allow camera access and try again."),
      );
    if (!navigator.mediaDevices)
      setErr("Camera needs a secure (https) connection.");
    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = videoRef.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => onDone(b), "image/jpeg", 0.85);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black w-full max-w-md">
        <div className="flex items-center justify-between border-b-2 border-black px-4 py-3">
          <p className="font-bold flex items-center gap-2">
            <Camera className="w-4 h-4" /> {title}
          </p>
          <button onClick={() => onDone(null)} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          {err ? (
            <p className="text-sm text-red-600 font-bold">{err}</p>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full border-2 border-black -scale-x-100 bg-black"
            />
          )}
          <p className="text-xs text-gray-500 mt-2">
            Face the camera in good light, one person only.
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <Btn light onClick={() => onDone(null)}>
              Cancel
            </Btn>
            <Btn disabled={!ready || !!err} onClick={snap}>
              Capture
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
