export type EventType = "clock_in" | "clock_out" | "duplicate" | "ignored" | "unknown";

export interface AttendanceEvent {
  id: string;
  employee_id: string | null;
  session_id: string | null;
  event_type: EventType;
  camera_id: string | null;
  recognized_at: string;
  confidence: number | null;
  notes: string | null;
  employee_name?: string;
  camera_name?: string;
  camera_direction?: string;
}

export interface AttendanceSession {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: string;
  employee_name?: string;
}

export interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
}

export interface HRUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
}

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export interface Camera {
  id: string;
  name: string;
  direction: string;
  target_fps?: number;
}

export interface AttendanceRecord {
  employee_id: string;
  full_name: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  duration_hours: number | null;
}

export interface AuditRecord {
  id: string;
  event_type: EventType;
  recognized_at: string;
  confidence: number | null;
  notes: string | null;
  full_name: string | null;
  camera_name: string | null;
}
