# Face Recognition Office Attendance System

Production-MVP office attendance system using FastAPI, plain HTML/CSS/JS, InsightFace, Postgres, and pgvector.

## Runtime

- FastAPI backend loads the InsightFace model once at startup.
- Plain browser frontend uses `getUserMedia` for employee registration and camera attendance.
- Postgres + pgvector stores users, face embeddings, cameras, attendance sessions, and audit events.
- Redis is not used.
- Streamlit prototype files may still exist, but FastAPI is the primary runtime.

## Roles

- `owner`: bootstrapped from `.env`; creates HR users and views reports.
- `hr`: registers employees and views reports.
- `employee`: no login for MVP; used as attendance subject only.

## Attendance Logic

- Incoming camera detects employee while clocked out: `clock_in`.
- Incoming camera detects employee already clocked in: `duplicate`.
- Outgoing camera detects employee while clocked in: `clock_out`.
- Outgoing camera detects employee clocked out: `ignored`.
- Unmatched/low-confidence faces: `unknown`.

Duplicate, ignored, and unknown events are stored for audit/debug visibility.

## Environment

Copy `.env.example`:

```bash
cp .env.example .env
```

Local defaults:

```env
DATABASE_URL=postgresql+psycopg://attendance:attendance@localhost:5433/attendance_db
APP_SECRET_KEY=change-me

BOOTSTRAP_OWNER_NAME=Owner Name
BOOTSTRAP_OWNER_EMAIL=owner@example.com
BOOTSTRAP_OWNER_PASSWORD=change-me

BOOTSTRAP_IN_CAMERA_ID=11111111-1111-1111-1111-111111111111
BOOTSTRAP_OUT_CAMERA_ID=22222222-2222-2222-2222-222222222222

CAMERA_ID=11111111-1111-1111-1111-111111111111
```

The compose Postgres service exposes host port `5433` to avoid conflicts with other local Postgres containers.

## Local Setup

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd frontend-next
npm install
npm run build
npm run dev
```

Simultaneously run the backend with

``` bash
cd ..
docker compose up -d postgres
uvicorn api.main:app --reload
```

The FastAPI app serves `frontend-next/out` when it exists, so rebuild the Next frontend after making UI changes.

Open:

```text
http://localhost:3000
```

Default bootstrap login:

```text
owner@example.com
change-me
```

Change this before real use.

## Docker

Run one incoming and one outgoing app instance:

```bash
docker compose up --build
```

Local URLs:

```text
Incoming camera/admin: http://localhost:8000
Outgoing camera/admin: http://localhost:8001
```

Both services share the same Postgres database but use different `CAMERA_ID` values.

**Reloading `.env` changes:** `docker compose up -d` does not detect edits to the contents of
`.env` — it only recreates containers when `docker-compose.yml` itself changes. After changing
any `SAMPLE_EVERY_N`, `DET_SIZE`, or other tuning value in `.env`, force a real reload:

```bash
docker compose up -d --force-recreate office-gate-in office-gate-out
```

**Real-time logs:** the image sets `PYTHONUNBUFFERED=1` so `print()`-based debug logs
(`[timing]`, `[spoof]`, `[patch]`, etc.) stream to `docker compose logs -f` immediately instead
of sitting in Python's block-buffer until it fills.

## Recognition Pipeline Tuning

Each frame goes through: face detection (every frame) → centroid tracking (every frame) →
anti-spoof + embedding (only on sampled frames) → temporal majority vote → commit.

Key environment variables (set in `.env`, take effect after `--force-recreate`):

| Variable | Default | Current | Effect |
|---|---|---|---|
| `SAMPLE_EVERY_N` | 15 | **2** | How often (in matched frames) a track runs anti-spoof + embedding. Lower = faster verdicts, more CPU spent per track. |
| `DET_SIZE` | 320 | **256** | Face detector input resolution. Lower = faster detection, slightly reduced range/accuracy. |
| `INTRA_OP_NUM_THREADS` | 3 | — | ONNXRuntime intra-op CPU parallelism for inference. |
| `INTER_OP_NUM_THREADS` | 1 | — | ONNXRuntime inter-op CPU parallelism. |
| `STREAM_EXECUTOR_WORKERS` | 2 | — | Thread pool size for offloading per-frame inference off the async event loop. |
| `SPOOF_THRESHOLD` | 0.6 | — | Liveness score cutoff; a rejected sample delays voting but doesn't invalidate the track. |

`CentroidTracker.get_majority_verdict` also requires a minimum of 3 votes (`min_votes`) in the
buffer, holding at least 30% majority, before it returns a verdict. Check `[timing]` logs
(`LOG_FRAME_TIMING=1`) to see actual per-frame ms and how many samples a track needed before its
`events=1` line — that's the fastest way to tell whether detection speed or vote requirements are
the current bottleneck.

## Pages

- `/`: owner/HR login.
- `/dashboard`: admin dashboard.
- `/hr`: owner-only HR management.
- `/register`: owner/HR employee registration.
- `/reports`: owner/HR reports and audit events.
- `/camera`: fixed-camera attendance page.

## API

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/hr`
- `POST /api/hr`
- `GET /api/employees`
- `POST /api/employees/register`
- `GET /api/camera/current`
- `POST /api/camera/detect`
- `GET /api/reports/attendance`
- `GET /api/reports/audit-events`
- `GET /health`

## Structure

```text
api/        FastAPI routes, auth cookie helpers, image decode helpers
core/       config, database initialization, bootstrap, security
db/         ORM models and repositories
services/   business logic for auth, users, faces, attendance, reports
frontend-next/  exported Next.js frontend served by FastAPI
frontend/   legacy plain HTML/CSS/JS frontend fallback
tests/      unit tests
```