async function loadReports() {
  await requireSession();
  const startDate = document.querySelector("#start-date").value;
  const endDate = document.querySelector("#end-date").value;
  const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
  try {
    renderTable("#attendance", await request(`/api/reports/attendance?${query}`));
    renderTable("#audit", await request("/api/reports/audit-events?limit=200"));
  } catch (error) {
    setStatus(error.message, true);
  }
}

const today = new Date();
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
document.querySelector("#end-date").valueAsDate = today;
document.querySelector("#start-date").valueAsDate = weekAgo;
document.querySelector("#load").addEventListener("click", loadReports);
loadReports();
