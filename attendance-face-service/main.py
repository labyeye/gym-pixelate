import hmac
import io
import logging
import os
import time

import face_recognition
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image, ImageOps
from starlette.concurrency import run_in_threadpool

API_KEY = os.environ.get("FACE_SERVICE_API_KEY", "")
MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.5"))
# Detection cost scales with pixel count — a selfie's face already fills most
# of the frame, so there's no accuracy reason to run detection on a full-res
# photo. Capping the longest edge here is a defensive floor: the mobile app
# already captures at ~640x480, but this also protects the web kiosk / older
# app builds that may still send larger images.
MAX_DETECTION_DIM = int(os.environ.get("FACE_MAX_DETECTION_DIM", "320"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-service")

app = FastAPI(title="NestGym Attendance Face Service")


@app.on_event("startup")
def warm_up():
    # dlib loads its detector/landmark/encoder models lazily on first use,
    # which made the first real request after every restart take 1s+.
    # Run one dummy detect + encode so every request is already "warm".
    blank = np.zeros((MAX_DETECTION_DIM, MAX_DETECTION_DIM, 3), dtype=np.uint8)
    face_recognition.face_locations(blank, number_of_times_to_upsample=0)
    face_recognition.face_encodings(
        blank, known_face_locations=[(0, MAX_DETECTION_DIM, MAX_DETECTION_DIM, 0)]
    )
    logger.info("face models warmed up")


if not API_KEY:
    logging.getLogger("face-service").error(
        "FACE_SERVICE_API_KEY is not set: every request will be rejected until it is configured"
    )


def check_api_key(x_api_key: str | None):
    # Fail closed (an unset key must not mean "no authentication") and compare in constant time.
    if not API_KEY or not hmac.compare_digest(x_api_key or "", API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


def load_image(raw: bytes) -> np.ndarray:
    try:
        # Phone cameras (vision-camera on Android especially) store portrait
        # selfies as landscape pixels + an EXIF orientation tag; dlib's
        # detector only finds upright faces, so apply the tag first.
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")
    if max(img.size) > MAX_DETECTION_DIM:
        img.thumbnail((MAX_DETECTION_DIM, MAX_DETECTION_DIM), Image.BILINEAR)
    return np.array(img)


def get_single_encoding(raw: bytes) -> list[float]:
    t0 = time.perf_counter()
    image = load_image(raw)
    t1 = time.perf_counter()
    # number_of_times_to_upsample=0: the default of 1 doubles image dimensions
    # before detecting (to catch small/distant faces), which roughly doubles
    # detection cost — unnecessary for a close-up verification selfie.
    locations = face_recognition.face_locations(image, number_of_times_to_upsample=0)
    if not locations:
        # No/lost EXIF tag (e.g. stripped by a proxy): try the other
        # orientations. Only runs on the failure path, so happy path is free.
        for k in (1, 3, 2):
            rotated = np.ascontiguousarray(np.rot90(image, k))
            locations = face_recognition.face_locations(
                rotated, number_of_times_to_upsample=0
            )
            if locations:
                image = rotated
                break
    t2 = time.perf_counter()
    if len(locations) == 0:
        raise HTTPException(status_code=422, detail="No face detected in image")
    if len(locations) > 1:
        raise HTTPException(
            status_code=422, detail="Multiple faces detected; use a single-face photo"
        )
    encodings = face_recognition.face_encodings(image, known_face_locations=locations)
    t3 = time.perf_counter()
    logger.info(
        "decode=%.0fms detect=%.0fms encode=%.0fms total=%.0fms",
        (t1 - t0) * 1000,
        (t2 - t1) * 1000,
        (t3 - t2) * 1000,
        (t3 - t0) * 1000,
    )
    return encodings[0].tolist()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/enroll")
async def enroll(
    file: UploadFile = File(...),
    x_api_key: str | None = Header(default=None),
):
    check_api_key(x_api_key)
    raw = await file.read()
    encoding = await run_in_threadpool(get_single_encoding, raw)
    return {"success": True, "encoding": encoding}


@app.post("/verify")
async def verify(
    file: UploadFile = File(...),
    encoding: str = Form(...),
    x_api_key: str | None = Header(default=None),
):
    check_api_key(x_api_key)
    raw = await file.read()
    probe_encoding = np.array(await run_in_threadpool(get_single_encoding, raw))

    try:
        stored = np.array([float(v) for v in encoding.split(",")])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid stored encoding")

    if stored.shape != probe_encoding.shape:
        raise HTTPException(status_code=400, detail="Encoding size mismatch")

    distance = float(np.linalg.norm(stored - probe_encoding))
    match = distance <= MATCH_THRESHOLD
    return {"success": True, "match": match, "distance": distance}
