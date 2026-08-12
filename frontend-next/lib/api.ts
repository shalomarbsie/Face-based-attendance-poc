const API_BASE = "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  const ct = res.headers.get("content-type") ?? "";
  const payload = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail =
      typeof payload === "object" && payload?.detail ? payload.detail : String(payload) || "Request failed";
    throw new ApiError(res.status, detail);
  }
  return payload as T;
}

// --- Auth ---
export function getMe() {
  return request<{ id: string; full_name: string; email: string; role: string }>("/api/auth/me");
}

export function login(email: string, password: string) {
  const body = new URLSearchParams({ email, password });
  return request<{ id: string; full_name: string; role: string }>("/api/auth/login", {
    method: "POST",
    body,
  });
}

export function logout() {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

// --- Employees ---
export function listEmployees() {
  return request<Array<{ id: string; full_name: string; email: string | null; status: string }>>("/api/employees");
}

// --- HR ---
export function listAdmins() {
  return request<Array<{ id: string; full_name: string; email: string; role: string; status: string }>>("/api/hr");
}

export function createHR(full_name: string, email: string, password: string) {
  const body = new URLSearchParams({ full_name, email, password });
  return request<{ id: string; full_name: string; email: string; role: string }>("/api/hr", {
    method: "POST",
    body,
  });
}

// --- Reports ---
export function getAttendanceReport(start_date?: string, end_date?: string) {
  const params = new URLSearchParams();
  if (start_date) params.set("start_date", start_date);
  if (end_date) params.set("end_date", end_date);
  return request<
    Array<{
      employee_id: string;
      full_name: string;
      work_date: string;
      clock_in_at: string | null;
      clock_out_at: string | null;
      duration_hours: number | null;
    }>
  >(`/api/reports/attendance?${params}`);
}

export function getAuditEvents(limit = 200) {
  return request<
    Array<{
      id: string;
      event_type: string;
      recognized_at: string;
      confidence: number | null;
      notes: string | null;
      full_name: string | null;
      camera_name: string | null;
    }>
  >(`/api/reports/audit-events?limit=${limit}`);
}

// --- Camera ---
export function getCurrentCamera() {
  return request<{ id: string; name: string; direction: string; target_fps: number }>("/api/camera/current");
}

// --- Register employee ---
export function registerEmployee(full_name: string, email: string, images: File[]) {
  const body = new FormData();
  body.append("full_name", full_name);
  body.append("email", email);
  for (const img of images) body.append("images", img);
  return request<{ id: string; full_name: string; samples: number }>("/api/employees/register", {
    method: "POST",
    body,
  });
}

// --- Cameras ---
export function listCameras() {
  return request<Array<{ id: string; name: string; direction: string }>>(
    "/api/cameras"
  );
}

// --- Audit events ---
export function updateAuditEvent(
  id: string,
  fields: { event_type?: string; notes?: string; recognized_at?: string }
) {
  const body = new URLSearchParams();
  if (fields.event_type !== undefined) body.set("event_type", fields.event_type);
  if (fields.notes !== undefined) body.set("notes", fields.notes);
  if (fields.recognized_at !== undefined) body.set("recognized_at", fields.recognized_at);
  return request<{ id: string; event_type: string }>(
    `/api/reports/audit-events/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );
}

export function createAuditEvent(fields: {
  employee_id?: string;
  camera_id: string;
  event_type: string;
  recognized_at: string;
  notes?: string;
}) {
  const body = new URLSearchParams();
  if (fields.employee_id) body.set("employee_id", fields.employee_id);
  body.set("camera_id", fields.camera_id);
  body.set("event_type", fields.event_type);
  body.set("recognized_at", fields.recognized_at);
  if (fields.notes) body.set("notes", fields.notes);
  return request<{ id: string; event_type: string }>(
    "/api/reports/audit-events",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );
}

export function deleteAuditEvent(id: string) {
  return request<{ ok: boolean }>(
    `/api/reports/audit-events/${id}`,
    { method: "DELETE" }
  );
}

// --- HR status toggle ---
export function updateHRStatus(userId: string, status: "active" | "inactive") {
  const body = new URLSearchParams({ status });
  return request<{ id: string; status: string }>(`/api/hr/${userId}/status`, {
    method: "PATCH",
    body,
  });
}