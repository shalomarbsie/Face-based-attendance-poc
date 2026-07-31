"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LiveFeed } from "@/components/LiveFeed";
import { PresencePanel } from "@/components/PresencePanel";
import { Users, UserCheck, AlertTriangle, Copy, Wifi, WifiOff } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Stats {
  totalToday: number;
  clockedIn: number;
  unknownCount: number;
  duplicateCount: number;
}

interface CameraStatus {
  id: string;
  name: string;
  direction: string;
  online: boolean;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-start gap-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `var(--${color}-bg)` }}
      >
        <Icon className="w-4 h-4" style={{ color: `var(--${color})` }} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function CameraCard({ camera }: { camera: CameraStatus }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          camera.online ? "bg-[var(--clock-in)]" : "bg-[var(--unknown)]"
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{camera.name}</p>
        <p className="text-xs text-muted-foreground capitalize">{camera.direction}</p>
      </div>
      {camera.online ? (
        <Wifi className="w-4 h-4 text-[var(--clock-in)] shrink-0" />
      ) : (
        <WifiOff className="w-4 h-4 text-[var(--unknown)] shrink-0" />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalToday: 0,
    clockedIn: 0,
    unknownCount: 0,
    duplicateCount: 0,
  });
  const [cameras, setCameras] = useState<CameraStatus[]>([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Get today's attendance
        const today = new Date().toISOString().slice(0, 10);
        const [attendRes, auditRes] = await Promise.all([
          fetch(`${API_BASE}/api/reports/attendance?start_date=${today}&end_date=${today}`, {
            credentials: "include",
          }),
          fetch(`${API_BASE}/api/reports/audit-events?limit=500`, {
            credentials: "include",
          }),
        ]);

        if (attendRes.ok) {
          const attend = await attendRes.json();
          const todayRecords = attend.filter((r: { work_date: string }) => r.work_date === today);
          const clockedIn = todayRecords.filter(
            (r: { clock_in_at: string | null; clock_out_at: string | null }) =>
              r.clock_in_at && !r.clock_out_at,
          ).length;
          setStats((prev) => ({
            ...prev,
            totalToday: todayRecords.length,
            clockedIn,
          }));
        }

        if (auditRes.ok) {
          const audit = await auditRes.json();
          const todayAudit = audit.filter((r: { recognized_at: string }) =>
            r.recognized_at.startsWith(today),
          );
          const unknownCount = todayAudit.filter(
            (r: { event_type: string }) => r.event_type === "unknown",
          ).length;
          const duplicateCount = todayAudit.filter(
            (r: { event_type: string }) => r.event_type === "duplicate",
          ).length;
          setStats((prev) => ({ ...prev, unknownCount, duplicateCount }));
        }
      } catch {
        // ignore
      }
    }

    async function fetchCameras() {
      try {
        const res = await fetch(`${API_BASE}/api/camera/current`, { credentials: "include" });
        if (res.ok) {
          const cam = await res.json();
          setCameras([{ id: cam.id, name: cam.name, direction: cam.direction, online: true }]);
        } else {
          setCameras([
            { id: "in", name: "Entrance Camera", direction: "in", online: false },
            { id: "out", name: "Exit Camera", direction: "out", online: false },
          ]);
        }
      } catch {
        setCameras([
          { id: "in", name: "Entrance Camera", direction: "in", online: false },
          { id: "out", name: "Exit Camera", direction: "out", online: false },
        ]);
      }
    }

    fetchStats();
    fetchCameras();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell>
      <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Page header */}
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Clocked In"
            value={stats.clockedIn}
            icon={UserCheck}
            color="clock-in"
          />
          <StatCard
            label="Total Today"
            value={stats.totalToday}
            icon={Users}
            color="clock-out"
          />
          <StatCard
            label="Unknown"
            value={stats.unknownCount}
            icon={AlertTriangle}
            color="unknown"
          />
          <StatCard
            label="Duplicates"
            value={stats.duplicateCount}
            icon={Copy}
            color="duplicate"
          />
        </div>

        {/* Camera status */}
        {cameras.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {cameras.map((cam) => (
              <CameraCard key={cam.id} camera={cam} />
            ))}
          </div>
        )}

        {/* Main content — live feed + presence */}
        <div className="grid grid-cols-[1fr_280px] gap-3" style={{ height: "calc(100vh - 340px)" }}>
          {/* Live feed */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <LiveFeed />
          </div>

          {/* Presence panel */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <PresencePanel />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
