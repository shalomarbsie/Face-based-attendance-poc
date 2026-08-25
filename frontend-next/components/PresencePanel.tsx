"use client";

import { useEffect, useState } from "react";
import { Search, UserCheck } from "lucide-react";

interface PresentEmployee {
  id: string;
  full_name: string;
  clock_in_at: string | null;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

export function PresencePanel() {
  const [employees, setEmployees] = useState<PresentEmployee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPresence() {
      try {
        const res = await fetch(`/api/reports/attendance`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: Array<{
          employee_id: string;
          full_name: string;
          work_date: string;
          clock_in_at: string | null;
          clock_out_at: string | null;
        }> = await res.json();

        // Currently present = clocked in today, no clock_out
        const today = new Date().toISOString().slice(0, 10);
        const present = data
          .filter((r) => r.work_date === today && r.clock_in_at && !r.clock_out_at)
          .reduce((acc, r) => {
            if (!acc.has(r.employee_id)) {
              acc.set(r.employee_id, { id: r.employee_id, full_name: r.full_name, clock_in_at: r.clock_in_at });
            }
            return acc;
          }, new Map<string, PresentEmployee>());
        setEmployees([...present.values()]);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchPresence();
    const interval = setInterval(fetchPresence, 10000);
    return () => clearInterval(interval);
  }, []);

  const filtered = employees.filter((e) =>
    e.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <UserCheck className="w-3.5 h-3.5 text-[var(--clock-in)]" />
          <span className="text-sm font-medium text-foreground">Currently In</span>
          <span className="text-xs text-muted-foreground">{employees.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-4 h-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-muted-foreground gap-1.5">
            <UserCheck className="w-7 h-7 opacity-20" />
            <p className="text-sm">{search ? "No match" : "No one in yet"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((emp) => (
              <div
                key={emp.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[var(--clock-in-bg)] border border-[var(--clock-in)]/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-[var(--clock-in)]">
                      {emp.full_name[0]?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-foreground truncate">{emp.full_name}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 font-mono">
                  {timeAgo(emp.clock_in_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
