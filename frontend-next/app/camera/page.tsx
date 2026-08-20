"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EventBadge } from "@/components/EventBadge";
import { Camera, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { listCameras } from "@/lib/api";
import type { EventType } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CameraConfig {
  id: string;
  name: string;
  direction: string;
}

interface DetectionResult {
  event_type: EventType;
  employee: string;
  confidence: number | null;
  id: string;
}

type WsStatus = "connecting" | "connected" | "disconnected" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatConfidence(c: number | null): string {
  if (c == null) return "";
  return `${Math.round(c * 100)}%`;
}

function wsUrlForCamera(cam: CameraConfig): string {
  const base =
    cam.direction === "out"
      ? (process.env.NEXT_PUBLIC_GATE_OUT_WS_URL ?? "ws://localhost:8001")
      : (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000");
  return `${base}/ws/camera/${cam.id}/stream`;
}

const EVENT_COLOR: Record<EventType, string> = {
  clock_in:  "var(--clock-in)",
  clock_out: "var(--clock-out)",
  duplicate: "var(--duplicate)",
  ignored:   "var(--ignored)",
  unknown:   "var(--unknown)",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CameraPage() {
  // Camera list loaded from DB
  const [cameras, setCameras]       = useState<CameraConfig[]>([]);
  const [activeIdx, setActiveIdx]   = useState(0);
  const [loadError, setLoadError]   = useState<string | null>(null);

  // Webcam
  const videoRef        = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [streamError,  setStreamError]  = useState<string | null>(null);

  // WebSocket — one per active camera tab
  const wsRef           = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wsStatus,  setWsStatus]  = useState<WsStatus>("disconnected");

  // Per-camera detection logs keyed by camera ID
  const [logsByCamera, setLogsByCamera]   = useState<Record<string, DetectionResult[]>>({});
  const [lastByCamera, setLastByCamera]   = useState<Record<string, DetectionResult | null>>({});

  const activeCamera  = cameras[activeIdx] ?? null;
  const detections    = activeCamera ? (logsByCamera[activeCamera.id] ?? []) : [];
  const lastEvent     = activeCamera ? (lastByCamera[activeCamera.id] ?? null) : null;

  // ── Load camera list from DB ──────────────────────────────────────────────

  useEffect(() => {
    listCameras()
      .then((cams) => {
        // Sort so "in" tab always comes first
        const sorted = [...cams].sort((a, b) =>
          a.direction === "in" ? -1 : b.direction === "in" ? 1 : 0
        );
        setCameras(sorted);
      })
      .catch(() => setLoadError("Could not load camera list."));
  }, []);

  // ── Start webcam once (shared across tabs) ────────────────────────────────

  useEffect(() => {
    if (cameras.length === 0) return;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      })
      .catch(() => setStreamError("Could not access webcam. Check browser permissions."));
    return () => {
      if (videoRef.current?.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameras.length]);

  // ── WebSocket connection ──────────────────────────────────────────────────

  const connectWS = useCallback((cam: CameraConfig) => {
    setWsStatus("connecting");
    const url = wsUrlForCamera(cam);
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      frameIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const canvas = canvasRef.current;
        const video  = videoRef.current;
        if (!canvas || !video || !video.videoWidth) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob && ws.readyState === WebSocket.OPEN) ws.send(blob);
          },
          "image/jpeg",
          0.7,
        );
      }, 200);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.events?.length) {
          const mapped: DetectionResult[] = data.events.map(
            (ev: { event_type: string; employee: string; confidence: number | null }, i: number) => ({
              id:         `${Date.now()}-${i}`,
              event_type: ev.event_type as EventType,
              employee:   ev.employee,
              confidence: ev.confidence,
            }),
          );
          // Store results under this camera's ID so switching tabs
          // shows the correct log for each gate
          setLogsByCamera((prev) => ({
            ...prev,
            [cam.id]: [...mapped, ...(prev[cam.id] ?? [])].slice(0, 20),
          }));
          setLastByCamera((prev) => ({ ...prev, [cam.id]: mapped[0] ?? null }));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => {
      setWsStatus("disconnected");
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, []);

  function disconnectWS() {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus("disconnected");
  }

  // Auto-connect whenever active camera or stream readiness changes
  useEffect(() => {
    if (!activeCamera || !streamActive) return;

    // Close previous connection before opening new one
    disconnectWS();
    connectWS(activeCamera);

    return () => {
      disconnectWS();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCamera?.id, streamActive]);

  // ── Tab switch handler ────────────────────────────────────────────────────

  function handleTabSwitch(idx: number) {
    if (idx === activeIdx) return;
    disconnectWS();
    setActiveIdx(idx);
    // connectWS fires via the useEffect above when activeCamera.id changes
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const error = loadError ?? streamError;

  return (
    <AppShell>
      <div className="p-6 max-w-[1200px] mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Camera</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live face recognition stream
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {wsStatus === "connected" ? (
              <Wifi className="w-4 h-4 text-[var(--clock-in)]" />
            ) : wsStatus === "connecting" ? (
              <div className="w-4 h-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground capitalize">{wsStatus}</span>
          </div>
        </div>

        {/* Camera tabs */}
        {cameras.length > 0 && (
          <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1 w-fit">
            {cameras.map((cam, idx) => (
              <button
                key={cam.id}
                onClick={() => handleTabSwitch(idx)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  activeIdx === idx
                    ? "bg-card text-foreground border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cam.name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-[var(--unknown-bg)] text-[var(--unknown)] border border-[var(--unknown)]/20 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-[1fr_300px] gap-4">
          {/* Video feed */}
          <div className="relative bg-card border border-border rounded-xl overflow-hidden aspect-video">
            {!streamActive && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Camera className="w-10 h-10 opacity-20" />
                <p className="text-sm">Initializing camera…</p>
              </div>
            )}

            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

            {/* Last event overlay */}
            {lastEvent && wsStatus === "connected" && (
              <div
                className="absolute top-4 left-4 right-4 flex items-center gap-3 rounded-lg px-4 py-3 border backdrop-blur-sm"
                style={{
                  background:   `color-mix(in srgb, ${EVENT_COLOR[lastEvent.event_type]} 8%, transparent)`,
                  borderColor:  `${EVENT_COLOR[lastEvent.event_type]}30`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                  style={{ background: EVENT_COLOR[lastEvent.event_type] }}
                />
                <span className="text-sm font-medium text-foreground">{lastEvent.employee}</span>
                <EventBadge type={lastEvent.event_type} />
                {lastEvent.confidence != null && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatConfidence(lastEvent.confidence)}
                  </span>
                )}
              </div>
            )}

            {/* Live indicator */}
            {wsStatus === "connected" && (
              <div className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-sm rounded px-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--clock-in)] animate-pulse" />
                <span className="text-[10px] font-medium text-foreground uppercase tracking-widest">
                  Live
                </span>
              </div>
            )}

            {/* Active camera label */}
            {activeCamera && wsStatus === "connected" && (
              <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-sm rounded px-2 py-1">
                <span className="text-[10px] font-medium text-muted-foreground capitalize">
                  {activeCamera.direction === "in" ? "Gate In" : "Gate Out"}
                </span>
              </div>
            )}
          </div>

          {/* Detection log — per camera */}
          <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-sm font-medium text-foreground">
                Detection Log
                {activeCamera && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal capitalize">
                    — {activeCamera.name}
                  </span>
                )}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
              {detections.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 text-muted-foreground gap-2">
                  <Camera className="w-7 h-7 opacity-20" />
                  <p className="text-xs">No detections yet</p>
                </div>
              ) : (
                detections.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{d.employee}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <EventBadge type={d.event_type} />
                      {d.confidence != null && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatConfidence(d.confidence)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </AppShell>
  );
}