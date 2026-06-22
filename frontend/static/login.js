document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  try {
    await request("/api/auth/login", { method: "POST", body: data });
    window.location.href = "/dashboard";
  } catch (error) {
    setStatus(error.message, true);
  }
});
