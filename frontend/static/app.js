async function request(path, options = {}) {
  const response = await fetch(path, { credentials: "include", ...options });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = payload.detail || payload || "Request failed";
    throw new Error(detail);
  }
  return payload;
}

function setStatus(message, isError = false) {
  const el = document.querySelector("#status");
  if (el) {
    el.textContent = message;
    el.style.color = isError ? "#ff8b8b" : "#bac4d6";
  }
}

async function requireSession() {
  try {
    return await request("/api/auth/me");
  } catch (_error) {
    window.location.href = "/";
  }
}

async function logout() {
  await request("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

function renderTable(selector, rows) {
  const root = document.querySelector(selector);
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = "<p>No data.</p>";
    return;
  }
  const columns = Object.keys(rows[0]);
  root.innerHTML = `<table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${columns.map((c) => `<td>${row[c] ?? ""}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}
