"use client";

import type { EventType } from "@/lib/types";
import { cn } from "@/lib/utils";

const EVENT_CONFIG: Record<EventType, { label: string; className: string }> = {
  clock_in: {
    label: "Clock In",
    className: "bg-[var(--clock-in-bg)] text-[var(--clock-in)] border-[var(--clock-in)]/20",
  },
  clock_out: {
    label: "Clock Out",
    className: "bg-[var(--clock-out-bg)] text-[var(--clock-out)] border-[var(--clock-out)]/20",
  },
  duplicate: {
    label: "Duplicate",
    className: "bg-[var(--duplicate-bg)] text-[var(--duplicate)] border-[var(--duplicate)]/20",
  },
  ignored: {
    label: "Ignored",
    className: "bg-[var(--ignored-bg)] text-[var(--ignored)] border-[var(--ignored)]/20",
  },
  unknown: {
    label: "Unknown",
    className: "bg-[var(--unknown-bg)] text-[var(--unknown)] border-[var(--unknown)]/20",
  },
};

interface Props {
  type: EventType | string;
  className?: string;
}

export function EventBadge({ type, className }: Props) {
  const config = EVENT_CONFIG[type as EventType] ?? {
    label: type,
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border tracking-wide",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
