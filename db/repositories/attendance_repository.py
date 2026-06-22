from datetime import date, datetime

from sqlalchemy import desc, func, select

from db.models import AttendanceEvent, AttendanceSession, Camera, User


class AttendanceRepository:
    def __init__(self, session):
        self.session = session

    def get_open_session(self, employee_id: str) -> AttendanceSession | None:
        return self.session.scalar(
            select(AttendanceSession)
            .where(AttendanceSession.employee_id == employee_id, AttendanceSession.status == "clocked_in")
            .order_by(desc(AttendanceSession.clock_in_at))
            .limit(1)
        )

    def get_latest_event(self, employee_id: str | None, camera_id: str | None) -> AttendanceEvent | None:
        stmt = select(AttendanceEvent).order_by(desc(AttendanceEvent.recognized_at)).limit(1)
        if employee_id:
            stmt = stmt.where(AttendanceEvent.employee_id == employee_id)
        if camera_id:
            stmt = stmt.where(AttendanceEvent.camera_id == camera_id)
        return self.session.scalar(stmt)

    def create_session(self, employee_id: str, camera_id: str, at: datetime) -> AttendanceSession:
        session = AttendanceSession(
            employee_id=employee_id,
            work_date=at.date(),
            clock_in_at=at,
            clock_in_camera_id=camera_id,
            status="clocked_in",
        )
        self.session.add(session)
        self.session.flush()
        return session

    def close_session(self, attendance_session: AttendanceSession, camera_id: str, at: datetime) -> AttendanceSession:
        attendance_session.clock_out_at = at
        attendance_session.clock_out_camera_id = camera_id
        attendance_session.status = "clocked_out"
        self.session.flush()
        return attendance_session

    def create_event(
        self,
        event_type: str,
        at: datetime,
        employee_id: str | None = None,
        session_id: str | None = None,
        camera_id: str | None = None,
        confidence: float | None = None,
        notes: str | None = None,
    ) -> AttendanceEvent:
        event = AttendanceEvent(
            employee_id=employee_id,
            session_id=session_id,
            event_type=event_type,
            camera_id=camera_id,
            recognized_at=at,
            confidence=confidence,
            notes=notes,
        )
        self.session.add(event)
        self.session.flush()
        return event

    def report(self, start_date: date, end_date: date):
        duration_seconds = func.extract(
            "epoch", AttendanceSession.clock_out_at - AttendanceSession.clock_in_at
        ).label("duration_seconds")
        stmt = (
            select(
                AttendanceSession.work_date,
                User.full_name,
                AttendanceSession.clock_in_at,
                AttendanceSession.clock_out_at,
                AttendanceSession.status,
                duration_seconds,
            )
            .join(User, User.id == AttendanceSession.employee_id)
            .where(AttendanceSession.work_date >= start_date, AttendanceSession.work_date <= end_date)
            .order_by(AttendanceSession.work_date.desc(), User.full_name)
        )
        return self.session.execute(stmt).all()

    def audit_events(self, limit: int = 200):
        stmt = (
            select(AttendanceEvent, User.full_name, Camera.name)
            .outerjoin(User, User.id == AttendanceEvent.employee_id)
            .outerjoin(Camera, Camera.id == AttendanceEvent.camera_id)
            .order_by(desc(AttendanceEvent.recognized_at))
            .limit(limit)
        )
        return self.session.execute(stmt).all()
