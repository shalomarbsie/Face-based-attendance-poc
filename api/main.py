import asyncio
from contextlib import asynccontextmanager
from datetime import date, timedelta
from concurrent.futures import ThreadPoolExecutor
import base64
from pathlib import Path

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from fastapi import Depends, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from api.auth import AUTH_COOKIE, create_session_token, require_roles
from api.image_utils import decode_image
from core.bootstrap import bootstrap_database
from core.config import get_settings
from core.db import SessionLocal
from db.repositories.camera_repository import CameraRepository
from services.attendance_service import AttendanceService
from services.auth_service import AuthService
from services.face_service import FaceService, get_face_app
from services.report_service import ReportService
from services.user_service import UserService
from services.stream_session import StreamSession
from services.spoof_service import get_spoof_session

_settings = get_settings()
_inference_executor = ThreadPoolExecutor(max_workers=_settings.stream_executor_workers)
_project_root = Path(__file__).resolve().parent.parent
_frontend_export_dir = _project_root / "frontend-next" / "out"
_legacy_frontend_dir = _project_root / "frontend" / "templates"
_frontend_page_map = {
    "login.html": "index",
    "dashboard.html": "dashboard",
    "hr.html": "hr",
    "register.html": "register",
    "reports.html": "reports",
    "camera.html": "camera",
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_database()
    get_face_app()          # pre-warms det_2.5g + w600k_r50
    get_spoof_session()     # pre-warms MiniFASNetV2
    print(f"[startup] models ready — det_size={_settings.det_size} spoof_threshold={_settings.spoof_threshold}")
    yield


app = FastAPI(title="Office Attendance", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


def dataframe_records(df):
    records = df.astype(object).where(df.notnull(), None).to_dict(orient="records")
    for record in records:
        for key, value in list(record.items()):
            if hasattr(value, "isoformat"):
                record[key] = value.isoformat()
    return records


def html_page(name: str) -> HTMLResponse:
    if _frontend_export_dir.is_dir():
        page_name = _frontend_page_map.get(name, name.removesuffix(".html"))
        candidate_paths = [
            _frontend_export_dir / page_name / "index.html",
            _frontend_export_dir / f"{page_name}.html",
        ]
        for candidate_path in candidate_paths:
            if candidate_path.is_file():
                return HTMLResponse(candidate_path.read_text(encoding="utf-8"))

    with open(_legacy_frontend_dir / name, encoding="utf-8") as file:
        return HTMLResponse(file.read())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index():
    return html_page("login.html")


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard():
    return html_page("dashboard.html")


@app.get("/hr", response_class=HTMLResponse)
def hr_page():
    return html_page("hr.html")


@app.get("/register", response_class=HTMLResponse)
def register_page():
    return html_page("register.html")


@app.get("/reports", response_class=HTMLResponse)
def reports_page():
    return html_page("reports.html")


@app.get("/camera", response_class=HTMLResponse)
def camera_page():
    return html_page("camera.html")


@app.post("/api/auth/login")
def login(response: Response, email: str = Form(...), password: str = Form(...)):
    with SessionLocal() as session:
        user = AuthService(session).authenticate(email, password)
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_session_token(user.id)
        response.set_cookie(AUTH_COOKIE, token, httponly=True, samesite="lax", max_age=60 * 60 * 12)
        return {"id": user.id, "full_name": user.full_name, "role": user.role}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(AUTH_COOKIE)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(require_roles("owner", "hr"))):
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role}


@app.get("/api/hr")
def list_admins(user=Depends(require_roles("owner"))):
    with SessionLocal() as session:
        admins = UserService(session).list_admins()
        return [
            {"id": row.id, "full_name": row.full_name, "email": row.email, "role": row.role, "status": row.status}
            for row in admins
        ]


@app.post("/api/hr")
def create_hr(
    full_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    actor=Depends(require_roles("owner")),
):
    with SessionLocal() as session:
        service = UserService(session)
        user = service.create_hr(actor, full_name, email, password)
        return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role}


@app.get("/api/employees")
def list_employees(user=Depends(require_roles("owner", "hr"))):
    with SessionLocal() as session:
        employees = UserService(session).list_employees()
        return [
            {"id": row.id, "full_name": row.full_name, "email": row.email, "status": row.status}
            for row in employees
        ]


@app.post("/api/employees/register")
async def register_employee(
    full_name: str = Form(...),
    email: str = Form(default=""),
    images: list[UploadFile] = File(...),
    actor=Depends(require_roles("owner", "hr")),
):
    if len(images) < 5:
        raise HTTPException(status_code=400, detail="At least 5 face samples are required")

    embeddings = []
    with SessionLocal() as session:
        face_service = FaceService(session)
        for image in images:
            frame = decode_image(await image.read())
            if frame is None:
                continue
            _, embedding = face_service.extract_one_embedding(frame)
            if embedding is not None:
                embeddings.append(embedding)

        if len(embeddings) < 5:
            raise HTTPException(status_code=400, detail="At least 5 valid face samples are required")

        embedding = np.vstack(embeddings).mean(axis=0).astype(np.float32).tolist()
        user = UserService(session).create_employee(actor, full_name, email.strip() or None, embedding)
        return {"id": user.id, "full_name": user.full_name, "samples": len(embeddings)}


@app.get("/api/camera/current")
def current_camera():
    settings = get_settings()
    if not settings.camera_id:
        raise HTTPException(status_code=400, detail="CAMERA_ID is not configured")
    with SessionLocal() as session:
        camera = CameraRepository(session).get(settings.camera_id)
        if camera is None or not camera.is_active:
            raise HTTPException(status_code=404, detail="Configured camera not found")
        return {
            "id": camera.id, 
            "name": camera.name, 
            "direction": camera.direction,
            "target_fps": settings.target_fps
        }


@app.post("/api/camera/detect")
async def camera_detect(image: UploadFile = File(...)):
    settings = get_settings()
    if not settings.camera_id:
        raise HTTPException(status_code=400, detail="CAMERA_ID is not configured")

    frame = decode_image(await image.read())
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    with SessionLocal() as session:
        face_service = FaceService(session)
        attendance = AttendanceService(session)
        results = face_service.detect_faces(frame)
        if not results:
            event = attendance.handle_unknown(settings.camera_id, None, "No face detected")
            return {"event_type": event.event_type, "employee": "Unknown", "confidence": None}

        response_events = []
        for result in results:
            employee, confidence = face_service.match_embedding(result["embedding"])
            if employee is None:
                event = attendance.handle_unknown(settings.camera_id, confidence, "No confident face match")
                response_events.append({"event_type": event.event_type, "employee": "Unknown", "confidence": confidence})
            else:
                event = attendance.handle_detection(employee.id, settings.camera_id, confidence)
                response_events.append(
                    {"event_type": event.event_type, "employee": employee.full_name, "confidence": confidence}
                )
        return {"events": response_events}

@app.websocket("/ws/camera/{camera_id}/stream")
async def camera_stream(websocket: WebSocket, camera_id: str):
    # Validate the camera before accepting — invalid camera_id
    # gets rejected with 1008 (Policy Violation) before the
    # handshake completes, so the client sees a clean close.
    with SessionLocal() as session:
        camera = CameraRepository(session).get(camera_id)
        if camera is None or not camera.is_active:
            await websocket.accept()
            await websocket.close(code=1008)
            return

    await websocket.accept()
    stream = StreamSession(camera_id=camera_id)
    # maxsize=1: if a frame is still being processed when the
    # next one arrives, drop the older frame. Always work on
    # the freshest data — critical on a 15W mobile chip.
    frame_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)
    # Separate queue for offline sync frames — processed sequentially
    sync_queue: asyncio.Queue[dict] = asyncio.Queue()
    stop_event = asyncio.Event()   # ← shared signal

    async def receive_frames():
        try:
            while not stop_event.is_set():
                message = await websocket.receive()

                if "bytes" in message and message["bytes"]:
                    data = await websocket.receive_bytes()
                    if frame_queue.full():
                        try:
                            frame_queue.get_nowait()   # drop stale frame
                        except asyncio.QueueEmpty:
                            pass
                    await frame_queue.put(data)
                elif "text" in message and message["text"]:
                    # Offline sync frame sent as JSON text
                    import json
                    payload = json.loads(message["text"])
                    if payload.get("type") == "sync":
                        await sync_queue.put(payload)

        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            stop_event.set()   # ← signal all other coroutines to stop

    async def process_frames():
        loop = asyncio.get_running_loop()
        try:
            while True:
                binary_data = await frame_queue.get()
                # Offload all blocking CPU work to the thread pool.
                # The async event loop stays free to keep receiving
                # frames from the client while inference runs.
                events = await loop.run_in_executor(
                    _inference_executor,
                    stream.process_frame,
                    binary_data,
                )
                if events:
                    await websocket.send_json({"events": events})
        except WebSocketDisconnect:
            pass

    async def process_sync_frames():
        """
        Processes offline frames sequentially, sending ACK after each.
        Uses the frame's original captured timestamp for attendance events.
        """
        loop = asyncio.get_running_loop()
        try:
            while not stop_event.is_set():
                try:
                    payload = await asyncio.wait_for(
                        sync_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue
                image_bytes = base64.b64decode(payload["image"])
                events = await loop.run_in_executor(
                    _inference_executor,
                    stream.process_frame,
                    image_bytes,
                )
                if not stop_event.is_set():
                # ACK tells the client this frame was processed — advance to next
                    await websocket.send_json({
                        "ack": True,
                        "index": payload["index"],
                        "events": events,
                    })
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            stop_event.set()

    await asyncio.gather(receive_frames(), process_frames(), process_sync_frames())


@app.get("/api/reports/attendance")
def attendance_report(
    start_date: date | None = None,
    end_date: date | None = None,
    user=Depends(require_roles("owner", "hr")),
):
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=7)
    with SessionLocal() as session:
        df = ReportService(session).attendance_report(start_date, end_date)
        return dataframe_records(df)


@app.get("/api/reports/audit-events")
def audit_events(limit: int = 200, user=Depends(require_roles("owner", "hr"))):
    with SessionLocal() as session:
        df = ReportService(session).audit_events(limit)
        return dataframe_records(df)


if _frontend_export_dir.is_dir():
    app.mount("/", StaticFiles(directory=_frontend_export_dir, html=True), name="frontend")

@app.get("/api/cameras")
def list_cameras(user=Depends(require_roles("owner", "hr"))):
    with SessionLocal() as session:
        cameras = CameraRepository(session).list_active()
        return [
            {"id": c.id, "name": c.name, "direction": c.direction}
            for c in cameras
        ]

# --- Audit event: update ---
@app.patch("/api/reports/audit-events/{event_id}")
async def update_audit_event(
    event_id: str,
    event_type: str = Form(None),
    notes: str = Form(None),
    recognized_at: str = Form(None),
    user=Depends(require_roles("owner", "hr")),
):
    with SessionLocal() as session:
        from db.models import AttendanceEvent, AttendanceSession
        from datetime import datetime, timezone

        event = session.query(AttendanceEvent).filter(
            AttendanceEvent.id == event_id
        ).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")

        old_type = event.event_type
        new_type = event_type if event_type is not None else old_type

        # Parse new timestamp if provided
        new_dt = None
        if recognized_at is not None:
            try:
                dt = datetime.fromisoformat(recognized_at.replace("Z", "+00:00"))
                new_dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid datetime format")

        # Apply event field updates
        if event_type is not None:
            event.event_type = event_type
        if notes is not None:
            event.notes = notes
        if new_dt is not None:
            event.recognized_at = new_dt

        # ── Sync attendance session ───────────────────────────────────────────
        # Only relevant when the event belongs to a known employee
        if event.employee_id:
            effective_dt = new_dt if new_dt is not None else event.recognized_at

            # Case 1: event is linked to a session directly via session_id
            linked_session = None
            if event.session_id:
                linked_session = session.query(AttendanceSession).filter(
                    AttendanceSession.id == event.session_id
                ).first()

            # Case 2: no session_id yet — find the employee's current open session
            if linked_session is None and new_type == "clock_out" and old_type != "clock_out":
                linked_session = session.query(AttendanceSession).filter(
                    AttendanceSession.employee_id == event.employee_id,
                    AttendanceSession.status == "clocked_in",
                ).first()
                if linked_session:
                    # Bind the event to this session now that we know which one
                    event.session_id = linked_session.id

            if linked_session:
                if old_type != "clock_out" and new_type == "clock_out":
                    # Close the session
                    linked_session.clock_out_at = effective_dt
                    linked_session.clock_out_camera_id = event.camera_id
                    linked_session.status = "clocked_out"

                elif old_type == "clock_out" and new_type != "clock_out":
                    # Reopen the session — undo the clock-out
                    linked_session.clock_out_at = None
                    linked_session.clock_out_camera_id = None
                    linked_session.status = "clocked_in"

                elif old_type == "clock_out" and new_type == "clock_out" and new_dt is not None:
                    # Just update the timestamp on an existing clock-out
                    linked_session.clock_out_at = new_dt

        session.commit()
        session.refresh(event)
        return {"id": event.id, "event_type": event.event_type}


# --- Audit event: delete ---
@app.delete("/api/reports/audit-events/{event_id}")
async def delete_audit_event(
    event_id: str,
    user=Depends(require_roles("owner", "hr")),
):
    with SessionLocal() as session:
        from db.models import AttendanceEvent
        event = session.query(AttendanceEvent).filter(
            AttendanceEvent.id == event_id
        ).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        session.delete(event)
        session.commit()
        return {"ok": True}


# --- Audit event: create manual entry ---
@app.post("/api/reports/audit-events")
async def create_audit_event(
    employee_id: str = Form(None),
    camera_id: str = Form(...),
    event_type: str = Form(...),
    recognized_at: str = Form(...),
    notes: str = Form(None),
    user=Depends(require_roles("owner", "hr")),
):
    with SessionLocal() as session:
        from db.models import AttendanceEvent
        from datetime import datetime, timezone
        import uuid
        try:
            dt = datetime.fromisoformat(recognized_at.replace("Z", "+00:00"))
            dt_utc = dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid datetime format")
        event = AttendanceEvent(
            id=str(uuid.uuid4()),
            employee_id=employee_id or None,
            camera_id=camera_id,
            event_type=event_type,
            recognized_at=dt_utc,
            notes=notes or None,
            confidence=None,
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        return {"id": event.id, "event_type": event.event_type}