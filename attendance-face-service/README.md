# NestHR Face Service

Internal microservice used by the backend to enroll and verify employee face
photos for mobile geofenced attendance. Produces 128-dimension `face_recognition`
(dlib) embeddings — the same format/threshold already used by the browser
biometric kiosk (`faceDescriptor` on the `Employee` model), so a face enrolled
via either flow works with both.

Not exposed publicly — only the Node backend talks to it.

## Setup

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install --no-deps -r requirements.txt
```

`--no-deps` is required: `face-recognition` declares a dependency on the
package literally named `dlib` (which has no prebuilt Linux wheel and
compiles from source via cmake). We install `dlib-bin` instead — a
prebuilt wheel that registers itself under the `dlib` name at import time
— but without `--no-deps`, pip's resolver still tries to separately fetch
and build the real `dlib` from PyPI to satisfy that declared dependency,
which is what causes cmake/pybind11 build failures on servers without a
full build toolchain. `requirements.txt` is a full frozen dependency list,
so `--no-deps` is safe here — nothing is missing.

## Run

```bash
FACE_SERVICE_API_KEY=<shared-secret> uvicorn main:app --port 8091
```

## Backend configuration

Set on the Node backend (`backend/.env`):

```
FACE_SERVICE_URL=http://127.0.0.1:8091
FACE_SERVICE_API_KEY=<same-shared-secret>
```

## Endpoints

- `GET /health`
- `POST /enroll` — multipart `file` (single-face photo) → `{ encoding: number[128] }`
- `POST /verify` — multipart `file` + form field `encoding` (comma-separated floats) → `{ match: boolean, distance: number }`

If the app says "Face recognition service is unavailable" or "API key mismatch", check `pm2 logs hrms-face-service` and that `FACE_SERVICE_API_KEY` is identical in `ecosystem.config.js` and `backend/.env` (the backend logs the exact cause).
The service warms its models at startup, so after a restart wait for `face models warmed up` in the log.

Both mutating endpoints require an `x-api-key` header matching `FACE_SERVICE_API_KEY`
if that env var is set.
