from datetime import datetime, timezone

from core.config import get_settings
from db.repositories.attendance_repository import AttendanceRepository
from db.repositories.camera_repository import CameraRepository


class AttendanceService:
    def __init__(self, session):
        self.session = session
        self.attendance = AttendanceRepository(session)
        self.cameras = CameraRepository(session)
        self.settings = get_settings()

    def handle_unknown(self, camera_id: str | None, confidence: float | None = None, notes: str | None = None):
        now = datetime.now(timezone.utc)
        event = self.attendance.create_event(
            event_type="unknown",
            at=now,
            camera_id=camera_id,
            confidence=confidence,
            notes=notes,
        )
        self.session.commit()
        return event

    def handle_detection(self, employee_id: str, camera_id: str, confidence: float):
        now = datetime.now(timezone.utc)
        camera = self.cameras.get(camera_id)
        if camera is None or not camera.is_active:
            event = self.attendance.create_event(
                event_type="ignored",
                at=now,
                employee_id=employee_id,
                camera_id=camera_id,
                confidence=confidence,
                notes="Camera is missing or inactive",
            )
            self.session.commit()
            return event

        latest_event = self.attendance.get_latest_event(employee_id, camera_id)
        if latest_event is not None:
            age = (now - latest_event.recognized_at).total_seconds()
            if age < self.settings.duplicate_window_seconds:
                event = self.attendance.create_event(
                    event_type="duplicate",
                    at=now,
                    employee_id=employee_id,
                    camera_id=camera_id,
                    confidence=confidence,
                    notes="Repeated detection inside duplicate window",
                )
                self.session.commit()
                return event

        open_session = self.attendance.get_open_session(employee_id)
        if camera.direction == "in":
            if open_session is None:
                session = self.attendance.create_session(employee_id, camera_id, now)
                event = self.attendance.create_event(
                    event_type="clock_in",
                    at=now,
                    employee_id=employee_id,
                    session_id=session.id,
                    camera_id=camera_id,
                    confidence=confidence,
                )
            else:
                event = self.attendance.create_event(
                    event_type="duplicate",
                    at=now,
                    employee_id=employee_id,
                    session_id=open_session.id,
                    camera_id=camera_id,
                    confidence=confidence,
                    notes="Employee is already clocked in",
                )
        elif camera.direction == "out":
            if open_session is not None:
                self.attendance.close_session(open_session, camera_id, now)
                event = self.attendance.create_event(
                    event_type="clock_out",
                    at=now,
                    employee_id=employee_id,
                    session_id=open_session.id,
                    camera_id=camera_id,
                    confidence=confidence,
                )
            else:
                event = self.attendance.create_event(
                    event_type="ignored",
                    at=now,
                    employee_id=employee_id,
                    camera_id=camera_id,
                    confidence=confidence,
                    notes="Outgoing camera saw employee without open session",
                )
        else:
            event = self.attendance.create_event(
                event_type="ignored",
                at=now,
                employee_id=employee_id,
                camera_id=camera_id,
                confidence=confidence,
                notes=f"Unsupported camera direction: {camera.direction}",
            )

        self.session.commit()
        return event
