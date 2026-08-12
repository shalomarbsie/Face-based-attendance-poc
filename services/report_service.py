from datetime import date

import pandas as pd

from db.repositories.attendance_repository import AttendanceRepository


class ReportService:
    def __init__(self, session):
        self.attendance = AttendanceRepository(session)

    def attendance_report(self, start_date: date, end_date: date) -> pd.DataFrame:
        rows = self.attendance.report(start_date, end_date)
        data = []
        for work_date, full_name, clock_in, clock_out, status, duration_seconds in rows:
            duration_seconds = int(duration_seconds or 0)
            hours, remainder = divmod(duration_seconds, 3600)
            minutes = remainder // 60
            data.append(
                {
                    "Date": work_date,
                    "Employee": full_name,
                    "Clock In": clock_in,
                    "Clock Out": clock_out,
                    "Duration": duration_seconds if clock_out else None,
                    "Status": status,
                }
            )
        return pd.DataFrame(data)

    def audit_events(self, limit: int = 200) -> pd.DataFrame:
        rows = self.attendance.audit_events(limit)
        data = []
        for event, employee_name, camera_name in rows:
            data.append(
                {
                    "id": event.id,
                    "event_type": event.event_type,
                    "recognized_at": event.recognized_at,
                    "confidence": event.confidence,
                    "notes": event.notes,
                    "full_name": employee_name or "Unknown",
                    "camera_name": camera_name,
                }
            )
        return pd.DataFrame(data)
