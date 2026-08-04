"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EventBadge } from "@/components/EventBadge";
import { Download, ChevronDown, Search, Pencil, X, Check } from "lucide-react";
import { getAttendanceReport, getAuditEvents, updateAuditEvent } from "@/lib/api";
import type { AttendanceRecord, AuditRecord } from "@/lib/types";

type Tab = "attendance" | "audit";

const EVENT_TYPES = ["clock_in", "clock_out", "duplicate", "ignored", "unknown"];

const QUICK_RANGES = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function exportCsv(rows: AttendanceRecord[]) {
  const header = "Employee,Date,Clock In,Clock Out,Duration\n";
  const body = rows
    .map(
      (r) =>
        `"${r.full_name}",${r.work_date},${r.clock_in_at ?? ""},${r.clock_out_at ?? ""},${
          r.duration_hours != null ? `${r.duration_hours.toFixed(2)}h` : ""
        }`
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface EditState {
  record: AuditRecord;
  event_type: string;
  notes: string;
  recognized_at: string;
  saving: boolean;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("attendance");
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [auditFilter, setAuditFilter] = useState<string>("all");
  const [editState, setEditState] = useState<EditState | null>(null);

  function applyQuickRange(days: number) {
    const end = new Date().toISOString().slice(0, 10);
    const start =
      days === 0
        ? end
        : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "attendance") {
        const data = await getAttendanceReport(startDate, endDate);
        setAttendance(data as AttendanceRecord[]);
      } else {
        const data = await getAuditEvents(500);
        setAudit(data as AuditRecord[]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tab, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSaveEdit() {
    if (!editState) return;
    setEditState((s) => s && { ...s, saving: true });
    try {
      await updateAuditEvent(editState.record.id, {
        event_type: editState.event_type,
        notes: editState.notes,
        recognized_at: editState.recognized_at,
      });
      setEditState(null);
      fetchData();
    } catch {
      setEditState((s) => s && { ...s, saving: false });
    }
  }

  const filteredAttendance = attendance.filter((r) =>
    (r.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredAudit = audit.filter((r) => {
    const matchesFilter = auditFilter === "all" || r.event_type === auditFilter;
    const matchesSearch =
      !search || (r.full_name ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <AppShell>
      <div className="p-6 max-w-[1200px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === "attendance"
                ? "Daily attendance records per employee — used for HR and payroll"
                : "Raw system detection log — every camera event with confidence and notes"}
            </p>
          </div>
          {tab === "attendance" && (
            <button
              onClick={() => exportCsv(filteredAttendance)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1 w-fit">
          {(["attendance", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
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
              {/* Quick range buttons */}
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
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">To</label>
                <input
                  type="date"
                  value={endDate}
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
                <option value="clock_in">Clock In</option>
                <option value="clock_out">Clock Out</option>
                <option value="duplicate">Duplicate</option>
                <option value="ignored">Ignored</option>
                <option value="unknown">Unknown</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Employee", "Date", "Clock In", "Clock Out", "Duration"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No records found
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Time", "Employee", "Event", "Camera", "Confidence", "Notes", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
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
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                        {r.notes ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setEditState({
                              record: r,
                              event_type: r.event_type,
                              notes: r.notes ?? "",
                              recognized_at: r.recognized_at,
                              saving: false,
                            })
                          }
                          className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Edit event"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      {editState && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Edit Audit Event</p>
              <button
                onClick={() => setEditState(null)}
                className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Event Type
                </label>
                <div className="relative">
                  <select
                    value={editState.event_type}
                    onChange={(e) => setEditState((s) => s && { ...s, event_type: e.target.value })}
                    className="w-full appearance-none bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace("_", " ")}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Timestamp
                </label>
                <input
                  type="datetime-local"
                  value={editState.recognized_at.slice(0, 16)}
                  onChange={(e) =>
                    setEditState((s) => s && { ...s, recognized_at: e.target.value + ":00Z" })
                  }
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editState.notes}
                  onChange={(e) => setEditState((s) => s && { ...s, notes: e.target.value })}
                  placeholder="Optional note…"
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setEditState(null)}
                className="px-4 py-2 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editState.saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {editState.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}