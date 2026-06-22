from datetime import date, timedelta

import streamlit as st

from core.db import SessionLocal
from services.report_service import ReportService
from ui.session import require_roles


st.set_page_config(page_title="Attendance Reports", layout="wide")
require_roles("owner", "hr")
st.subheader("Attendance Reports")

default_start = date.today() - timedelta(days=7)
start_date = st.date_input("Start date", value=default_start)
end_date = st.date_input("End date", value=date.today())

with SessionLocal() as session:
    reports = ReportService(session)
    report_df = reports.attendance_report(start_date, end_date)
    audit_df = reports.audit_events(limit=200)

tab1, tab2 = st.tabs(["Attendance", "Audit Events"])
with tab1:
    if report_df.empty:
        st.warning("No attendance sessions found for this date range")
    else:
        st.dataframe(report_df, use_container_width=True)

with tab2:
    if audit_df.empty:
        st.warning("No audit events found")
    else:
        st.dataframe(audit_df, use_container_width=True)
