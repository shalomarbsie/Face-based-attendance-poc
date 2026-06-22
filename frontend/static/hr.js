async function loadAdmins() {
  await requireSession();
  try {
    renderTable("#admins", await request("/api/hr"));
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.querySelector("#hr-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/hr", { method: "POST", body: new FormData(event.target) });
    event.target.reset();
    setStatus("HR user created.");
    await loadAdmins();
  } catch (error) {
    setStatus(error.message, true);
  }
});

loadAdmins();
