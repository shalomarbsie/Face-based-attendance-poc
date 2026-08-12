"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EventBadge } from "@/components/EventBadge";
import {
  Download, ChevronDown, Search, Pencil, X, Check, Trash2, Plus
} from "lucide-react";
import {
  getAttendanceReport, getAuditEvents, listEmployees, listCameras,
  updateAuditEvent, deleteAuditEvent, createAuditEvent,
} from "@/lib/api";
import type { AttendanceRecord, AuditRecord } from "@/lib/types";

type Tab = "attendance" | "audit";
const EVENT_TYPES = ["clock_in", "clock_out", "duplicate", "ignored", "unknown"];
const QUICK_RANGES = [
  { label: "Today",   days: 0 },
  { label: "7 days",  days: 7 },
  { label: "30 days", days: 30 },
  { label: "All",     days: -1 },
];

function isoLocal(date: Date): string {
  // Returns datetime-local input value in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function exportAttendanceCsv(rows: AttendanceRecord[]) {
  const header = "Employee,Date,Clock In,Clock Out,Duration\n";
  const body = rows.map((r) =>
    `"${r.full_name}",${r.work_date},${r.clock_in_at ?? ""},${r.clock_out_at ?? ""},${
      r.duration_hours != null ? `${r.duration_hours.toFixed(2)}h` : ""
    }`
  ).join("\n");
  triggerCsvDownload(header + body, `attendance-${today()}.csv`);
}

function exportAuditCsv(rows: AuditRecord[]) {
  const header = "Time,Employee,Event,Camera,Confidence,Notes\n";
  const body = rows.map((r) =>
    `"${new Date(r.recognized_at).toISOString()}","${r.full_name ?? ""}","${r.event_type}","${r.camera_name ?? ""}","${r.confidence != null ? Math.round(r.confidence * 100) + "%" : ""}","${r.notes ?? ""}"`
  ).join("\n");
  triggerCsvDownload(header + body, `audit-${today()}.csv`);
}

function triggerCsvDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Employee { id: string; full_name: string; }
interface Camera   { id: string; name: string; direction: string; }

interface EditState {
  record: AuditRecord;
  event_type: string;
  notes: string;
  recognized_at: string; // datetime-local format
  saving: boolean;
  error: string | null;
}

interface AddState {
  employee_id: string;
  camera_id: string;
  event_type: string;
  recognized_at: string;
  notes: string;
  saving: boolean;
  error: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("attendance");
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [audit, setAudit]     = useState<AuditRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cameras, setCameras]     = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [addState,  setAddState]  = useState<AddState  | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  // Date range
  const [startDate, setStartDate] = useState(daysAgo(7));
  const [endDate,   setEndDate]   = useState(today());

  function applyQuickRange(days: number) {
    if (days === -1) { setStartDate(""); setEndDate(""); return; }
    setEndDate(today());
    setStartDate(days === 0 ? today() : daysAgo(days));
  }

  // Fetch supporting data once
  useEffect(() => {
    listEmployees().then(setEmployees).catch(() => {});
    listCameras().then(setCameras).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "attendance") {
        // Pass dates only when set — empty string means "all time"
        const data = await getAttendanceReport(startDate || undefined, endDate || undefined);
        setAttendance(data as AttendanceRecord[]);
      } else {
        const data = await getAuditEvents(1000);
        setAudit(data as AuditRecord[]);
      }
    } catch {
      // ignore — table will show empty state
    } finally {
      setLoading(false);
    }
  }, [tab, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Edit handlers ──────────────────────────────────────────────────────────

  async function handleSaveEdit() {
    if (!editState) return;
    console.log("[edit] handleSaveEdit called, recognized_at =", editState.recognized_at);
    console.log("[edit] parsed date =", new Date(editState.recognized_at));
    setEditState((s) => s && { ...s, saving: true, error: null });
    try {
      await updateAuditEvent(editState.record.id, {
        event_type: editState.event_type,
        notes: editState.notes,
        // Convert datetime-local back to ISO
        recognized_at: new Date(editState.recognized_at).toISOString(),
      });
      setEditState(null);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setEditState((s) => s && { ...s, saving: false, error: msg });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteAuditEvent(deleteId).catch(() => {});
    setDeleteId(null);
    fetchData();
  }

  async function handleAdd() {
    if (!addState) return;
    setAddState((s) => s && { ...s, saving: true, error: null });
    try {
      await createAuditEvent({
        employee_id: addState.employee_id || undefined,
        camera_id: addState.camera_id,
        event_type: addState.event_type,
        recognized_at: new Date(addState.recognized_at).toISOString(),
        notes: addState.notes || undefined,
      });
      setAddState(null);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Create failed";
      setAddState((s) => s && { ...s, saving: false, error: msg });
    }
  }

  function openAddDialog() {
    setAddState({
      employee_id: "",
      camera_id: cameras[0]?.id ?? "",
      event_type: "clock_in",
      recognized_at: isoLocal(new Date()),
      notes: "",
      saving: false,
      error: null,
    });
  }

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const filteredAttendance = attendance.filter((r) =>
    (r.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredAudit = audit.filter((r) => {
    const matchType   = auditFilter === "all" || r.event_type === auditFilter;
    const matchSearch = !search || (r.full_name ?? "Unknown").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // ── Shared input classes ───────────────────────────────────────────────────

  const inputCls = "w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20";
  const selectCls = `${inputCls} appearance-none cursor-pointer`;
  const dialogSelectCls = "w-full appearance-none cursor-pointer border border-border rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300";
  const dialogInputCls  = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-6 max-w-[1200px] mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === "attendance"
                ? "Completed attendance sessions per employee — used for HR and payroll"
                : "Every raw detection event from all cameras — full system audit trail"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {tab === "audit" && (
              <button
                onClick={openAddDialog}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Event
              </button>
            )}
            <button
              onClick={() =>
                tab === "attendance"
                  ? exportAttendanceCsv(filteredAttendance)
                  : exportAuditCsv(filteredAudit)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1 w-fit">
          {(["attendance", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "attendance" ? "Attendance" : "Audit Events"}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {tab === "attendance" && (
            <>
              <div className="flex items-center gap-1 bg-secondary border border-border rounded-md p-1">
                {QUICK_RANGES.map(({ label, days }) => (
                  <button
                    key={label}
                    onClick={() => applyQuickRange(days)}
                    className="px-2.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">From</label>
                <input
                  type="date" value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">To</label>
                <input
                  type="date" value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
            </>
          )}

          {tab === "audit" && (
            <div className="relative">
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="appearance-none bg-secondary border border-border rounded-md text-xs text-foreground pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-foreground/20 cursor-pointer"
              >
                <option value="all">All types</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text" placeholder="Search employee…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-secondary border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20 w-44"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-5 h-5 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
            </div>
          ) : tab === "attendance" ? (

            /* ── Attendance table ── */
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Employee", "Date", "Clock In", "Clock Out", "Duration"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm space-y-2">
                      <p className="text-muted-foreground">No attendance records found</p>
                      <p className="text-xs text-muted-foreground/60">
                        Records appear when employees complete a clock-in → clock-out cycle.
                        Try the "All" quick filter to see all dates.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((r, i) => (
                    <tr key={i} className="hover:bg-foreground/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{r.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.work_date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{formatDateTime(r.clock_in_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{formatDateTime(r.clock_out_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatDuration(r.duration_hours)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

          ) : (

            /* ── Audit table ── */
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Time", "Employee", "Event", "Camera", "Confidence", "Notes", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No events found
                    </td>
                  </tr>
                ) : (
                  filteredAudit.map((r) => (
                    <tr key={r.id} className="hover:bg-foreground/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.recognized_at).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit", hour12: false,
                        })}
                      </td>
                      <td className="px-4 py-3 text-foreground">{r.full_name ?? "Unknown"}</td>
                      <td className="px-4 py-3"><EventBadge type={r.event_type} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.camera_name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{r.notes ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditState({
                              record: r,
                              event_type: r.event_type,
                              notes: r.notes ?? "",
                              recognized_at: isoLocal(new Date(r.recognized_at)),
                              saving: false,
                              error: null,
                            })}
                            className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteId(r.id)}
                            className="p-1 rounded hover:bg-[var(--unknown-bg)] text-muted-foreground hover:text-[var(--unknown)] transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Edit dialog ── */}
      {editState && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Edit Audit Event</p>
              <button onClick={() => setEditState(null)} className="p-1 rounded hover:bg-foreground/10 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Type</label>
                <div className="relative">
                  <select
                    style={{ colorScheme: "light" }}
                    value={editState.event_type}
                    onChange={(e) => setEditState((s) => s && { ...s, event_type: e.target.value })}
                    className={dialogSelectCls}
                  >
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timestamp</label>
                <input
                  type="datetime-local"
                  value={editState.recognized_at}
                  onChange={(e) => setEditState((s) => s && { ...s, recognized_at: e.target.value })}
                  className={dialogInputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea
                  rows={2} value={editState.notes} placeholder="Optional note…"
                  onChange={(e) => setEditState((s) => s && { ...s, notes: e.target.value })}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {editState.error && (
                <p className="text-xs text-[var(--unknown)]">{editState.error}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditState(null)} className="px-4 py-2 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveEdit} disabled={editState.saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {editState.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <p className="text-sm font-semibold text-foreground">Delete this event?</p>
            <p className="text-xs text-muted-foreground">
              This permanently removes the audit event record. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-[var(--unknown)] text-white rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add event dialog ── */}
      {addState && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Add Manual Event</p>
              <button onClick={() => setAddState(null)} className="p-1 rounded hover:bg-foreground/10 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Employee</label>
                <div className="relative">
                  <select
                    style={{ colorScheme: "light" }}
                    value={addState.employee_id}
                    onChange={(e) => setAddState((s) => s && { ...s, employee_id: e.target.value })}
                    className={dialogSelectCls}
                  >
                    <option value="">Unknown / No employee</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Camera</label>
                <div className="relative">
                  <select
                    style={{ colorScheme: "light" }}
                    value={addState.camera_id}
                    onChange={(e) => setAddState((s) => s && { ...s, camera_id: e.target.value })}
                    className={dialogSelectCls}
                  >
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.direction})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Type</label>
                <div className="relative">
                  <select
                    style={{ colorScheme: "light" }}
                    value={addState.event_type}
                    onChange={(e) => setAddState((s) => s && { ...s, event_type: e.target.value })}
                    className={dialogSelectCls}
                  >
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timestamp</label>
                <input
                  type="datetime-local"
                  value={addState.recognized_at}
                  onChange={(e) => setAddState((s) => s && { ...s, recognized_at: e.target.value })}
                  className={dialogInputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea
                  rows={2} value={addState.notes} placeholder="Optional note…"
                  onChange={(e) => setAddState((s) => s && { ...s, notes: e.target.value })}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {addState.error && (
                <p className="text-xs text-[var(--unknown)]">{addState.error}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setAddState(null)} className="px-4 py-2 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAdd} disabled={addState.saving || !addState.camera_id}
                className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {addState.saving ? "Creating…" : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}