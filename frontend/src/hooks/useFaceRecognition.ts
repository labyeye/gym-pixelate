import { useRef, useState, useCallback } from "react";
import * as faceapi from "@vladmandic/face-api";

type LoadState = "idle" | "loading" | "ready" | "error";

let modelsLoaded = false;

async function ensureModels() {
  if (modelsLoaded) return;
  const MODEL_URL = "/models";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

export interface FaceDescriptor {
  descriptor: number[];
  capturedAt: string;
}

export function useFaceRecognition() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionInterval = useRef<number | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [cameraActive, setCameraActive] = useState(false);
  const [liveDetection, setLiveDetection] =
    useState<faceapi.FaceDetection | null>(null);

  const loadModels = useCallback(async () => {
    if (modelsLoaded) {
      setLoadState("ready");
      return;
    }
    setLoadState("loading");
    try {
      await ensureModels();
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  const startCamera = useCallback(async () => {
    await loadModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      // A second start (e.g. React StrictMode remount) replaces the first; release the older stream.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch (e: any) {
          // "play() interrupted by a new load request" just means the stream was swapped/stopped meanwhile.
          if (e?.name !== "AbortError") throw e;
          if (streamRef.current !== stream) return;
        }
        setCameraActive(true);
      }
    } catch (e: any) {
      throw new Error("Camera access denied: " + e.message);
    }
  }, [loadModels]);

  const stopCamera = useCallback(() => {
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setCameraActive(false);
    setLiveDetection(null);
  }, []);

  const captureFaceDescriptor = useCallback(async (): Promise<number[]> => {
    if (!videoRef.current || loadState !== "ready") {
      throw new Error("Camera or models not ready");
    }
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection)
      throw new Error("No face detected — look directly at camera");

    const score = detection.detection.score;
    if (score < 0.7)
      throw new Error(
        `Face confidence too low (${(score * 100).toFixed(0)}%) — improve lighting`,
      );

    return Array.from(detection.descriptor);
  }, [loadState]);

  // Eye Aspect Ratio: low value = eyes closed. Photos/screens never dip this, so a
  // blink within the capture window proves a live person, not a printed/displayed photo.
  const eyeAspectRatio = (eye: faceapi.Point[]) => {
    const dist = (a: faceapi.Point, b: faceapi.Point) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    return (
      (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * dist(eye[0], eye[3]))
    );
  };

  const BLINK_EAR_THRESHOLD = 0.22;
  const LIVENESS_TIMEOUT_MS = 4000;
  const LIVENESS_POLL_MS = 100;

  // Watches for a natural blink over a short window, then immediately captures the
  // descriptor — keeps the total scan-to-result time low while blocking photo spoofing.
  const captureFaceDescriptorWithLiveness = useCallback(async (): Promise<
    number[]
  > => {
    if (!videoRef.current || loadState !== "ready") {
      throw new Error("Camera or models not ready");
    }
    const video = videoRef.current;
    const deadline = Date.now() + LIVENESS_TIMEOUT_MS;
    let sawOpen = false;
    let sawBlink = false;

    while (Date.now() < deadline && !sawBlink) {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (detection) {
        const landmarks = detection.landmarks;
        const ear =
          (eyeAspectRatio(landmarks.getLeftEye()) +
            eyeAspectRatio(landmarks.getRightEye())) /
          2;
        if (ear >= BLINK_EAR_THRESHOLD) sawOpen = true;
        else if (sawOpen) sawBlink = true;
      }
      if (!sawBlink) await new Promise((r) => setTimeout(r, LIVENESS_POLL_MS));
    }

    if (!sawBlink)
      throw new Error(
        "Liveness check failed — please blink naturally, photos are not accepted",
      );

    return captureFaceDescriptor();
  }, [loadState, captureFaceDescriptor]);

  const startLiveDetection = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || loadState !== "ready")
      return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    detectionInterval.current = window.setInterval(async () => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      faceapi.matchDimensions(canvas, {
        width: video.videoWidth,
        height: video.videoHeight,
      });

      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      if (detection) {
        setLiveDetection(detection.detection);
        const resized = faceapi.resizeResults(detection, {
          width: video.videoWidth,
          height: video.videoHeight,
        });
        faceapi.draw.drawDetections(canvas, [resized]);
        faceapi.draw.drawFaceLandmarks(canvas, [resized]);
      } else {
        setLiveDetection(null);
      }
    }, 300);
  }, [loadState]);

  const matchDescriptor = useCallback(
    (
      captured: number[],
      stored: Array<{ employeeId: string; descriptor: number[] }>,
      threshold = 0.5,
    ) => {
      if (!stored.length) return null;
      const labeledDescriptors = stored.map(
        (s) =>
          new faceapi.LabeledFaceDescriptors(s.employeeId, [
            new Float32Array(s.descriptor),
          ]),
      );
      const matcher = new faceapi.FaceMatcher(labeledDescriptors, threshold);
      const match = matcher.findBestMatch(new Float32Array(captured));
      return match.label === "unknown"
        ? null
        : { employeeId: match.label, distance: match.distance };
    },
    [],
  );

  return {
    videoRef,
    canvasRef,
    loadState,
    cameraActive,
    liveDetection,
    startCamera,
    stopCamera,
    loadModels,
    captureFaceDescriptor,
    captureFaceDescriptorWithLiveness,
    startLiveDetection,
    matchDescriptor,
  };
}
