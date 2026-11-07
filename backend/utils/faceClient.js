// Thin client for the internal Python face-recognition microservice (../face-service).
// Uses Node's built-in fetch/FormData/Blob — no extra dependency needed.

const FACE_SERVICE_URL =
  process.env.FACE_SERVICE_URL || "http://127.0.0.1:8091";
const FACE_SERVICE_API_KEY = process.env.FACE_SERVICE_API_KEY || "";
// Bounds how long we wait on the Python service — without this, a stuck
// face-service process would hang the request indefinitely (the mobile
// client only has its own 30s abort as a backstop).
const FACE_SERVICE_TIMEOUT_MS = 10_000;

async function callFaceService(
  path,
  buffer,
  filename,
  mimetype,
  extraFields = {},
) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype }), filename);
  for (const [key, value] of Object.entries(extraFields))
    form.append(key, value);

  let res;
  try {
    res = await fetch(`${FACE_SERVICE_URL}${path}`, {
      method: "POST",
      headers: FACE_SERVICE_API_KEY
        ? { "x-api-key": FACE_SERVICE_API_KEY }
        : {},
      body: form,
      signal: AbortSignal.timeout(FACE_SERVICE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(
      `[faceService] ${path} unreachable at ${FACE_SERVICE_URL}:`,
      err.cause?.code || err.name,
      err.message,
    );
    throw new Error("Face recognition service is unavailable");
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    console.error(
      "[faceService] 401 — FACE_SERVICE_API_KEY on backend and face-service differ",
    );
    throw new Error("Face service is misconfigured (API key mismatch)");
  }
  if (!res.ok) {
    throw new Error(data.detail || `Face service error (${res.status})`);
  }
  return data;
}

// Returns a 128-number face embedding for the given single-face photo.
async function enrollFace(buffer, filename, mimetype) {
  const data = await callFaceService("/enroll", buffer, filename, mimetype);
  return data.encoding;
}

// Compares a live photo against a previously enrolled embedding.
async function verifyFace(buffer, filename, mimetype, storedDescriptor) {
  const data = await callFaceService("/verify", buffer, filename, mimetype, {
    encoding: storedDescriptor.join(","),
  });
  return { match: data.match, distance: data.distance };
}

module.exports = { enrollFace, verifyFace };
