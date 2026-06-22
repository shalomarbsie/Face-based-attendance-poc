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
docker compose up -d postgres
uvicorn api.main:app --reload
```

Open:

```text
http://localhost:8000
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
frontend/   plain HTML/CSS/JS frontend
tests/      unit tests
```
