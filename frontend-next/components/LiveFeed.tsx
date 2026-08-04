"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, ChevronDown } from "lucide-react";
import { EventBadge } from "./EventBadge";
import type { EventType } from "@/lib/types";

interface FeedEvent {
  id: string;
  employee: string;
  event_type: EventType;
  timestamp: Date;
  camera?: string;
  direction?: string;
  confidence?: number | null;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function ConfidencePip({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "var(--clock-in)" : pct >= 60 ? "var(--duplicate)" : "var(--unknown)";
  return (
    <span className="text-xs font-mono" style={{ color }}>
      {pct}%
    </span>
  );
}

interface Props {
  maxItems?: number;
}

export function LiveFeed({ maxItems = 60 }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [filter, setFilter] = useState<EventType | "all">("all");
  const listRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const res = await fetch(`/api/reports/audit-events?limit=50`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: Array<{
          id: string;
          event_type: string;
          recognized_at: string;
          confidence: number | null;
          full_name: string | null;
          camera_name: string | null;
        }> = await res.json();

        const newEvents: FeedEvent[] = [];
        for (const row of data) {
          if (seenIds.current.has(row.id)) continue;
          seenIds.current.add(row.id);
          newEvents.push({
            id: row.id,
            employee: row.full_name ?? "Unknown",
            event_type: row.event_type as EventType,
            timestamp: new Date(row.recognized_at),
            camera: row.camera_name ?? undefined,
            confidence: row.confidence,
          });
        }

        if (newEvents.length > 0) {
          setEvents((prev) => {
            const combined = [...newEvents, ...prev];
            return combined.slice(0, maxItems);
          });
        }
      } catch {
        // ignore fetch errors
      }
    }

    poll();
    interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [maxItems]);

  // Auto-scroll to top when not paused
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [events]);

  const filtered = filter === "all" ? events : events.filter((e) => e.event_type === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[var(--clock-in)]" />
          <span className="text-sm font-medium text-foreground">Live Feed</span>
          {events.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
          {/* Filter */}
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as EventType | "all")}
            className="appearance-none bg-secondary border border-border rounded text-xs text-foreground pl-2.5 pr-6 py-1 focus:outline-none focus:ring-1 focus:ring-foreground/20 cursor-pointer"
          >
            <option value="all">All events</option>
            <option value="clock_in">Clock In</option>
            <option value="clock_out">Clock Out</option>
            <option value="duplicate">Duplicate</option>
            <option value="ignored">Ignored</option>
            <option value="unknown">Unknown</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Event list */}
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
            <Radio className="w-8 h-8 opacity-20" />
            <p className="text-sm">Waiting for events…</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((ev, i) => (
              <div
                key={ev.id ?? `${ev.timestamp.getTime()}-${i}`}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  i === 0 ? "bg-foreground/[0.03]" : "hover:bg-foreground/[0.02]"
                }`}
              >
                {/* Time */}
                <span className="text-xs font-mono text-muted-foreground mt-0.5 w-20 shrink-0">
                  {formatTime(ev.timestamp)}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {ev.employee}
                    </span>
                    <EventBadge type={ev.event_type} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ev.camera && (
                      <span className="text-xs text-muted-foreground">{ev.camera}</span>
                    )}
                    <ConfidencePip value={ev.confidence} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
