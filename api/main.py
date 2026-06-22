from contextlib import asynccontextmanager
from datetime import date, timedelta

import numpy as np
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_database()
    get_face_app()
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
    with open(f"frontend/templates/{name}", encoding="utf-8") as file:
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
        return {"id": camera.id, "name": camera.name, "direction": camera.direction}


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
