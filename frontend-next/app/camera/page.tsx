"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EventBadge } from "@/components/EventBadge";
import { Camera, Wifi, WifiOff, AlertCircle } from "lucide-react";
import type { EventType } from "@/lib/types";

const API_BASE = "";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
console.log("[camera] WS_BASE =", WS_BASE);

interface DetectionResult {
  event_type: EventType;
  employee: string;
  confidence: number | null;
  id: string;
}

function formatConfidence(c: number | null): string {
  if (c == null) return "";
  return `${Math.round(c * 100)}%`;
}

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasConnected = useRef(false);

  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameraName, setCameraName] = useState("Camera");
  const [cameraDirection, setCameraDirection] = useState("");
  const [streamActive, setStreamActive] = useState(false);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "disconnected",
  );
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [lastEvent, setLastEvent] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch camera config
  useEffect(() => {
    fetch(`/api/camera/current`, { credentials: "include" })
      .then((r) => r.json())
      .then((cam) => {
        setCameraId(cam.id);
        setCameraName(cam.name);
        setCameraDirection(cam.direction);
      })
      .catch(() => setError("Could not load camera configuration."));
  }, []);

  // Start webcam
  useEffect(() => {
    if (!cameraId) return;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      })
      .catch(() => setError("Could not access webcam. Check browser permissions."));
    return () => {
      if (videoRef.current?.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraId]);

  // Connect WebSocket and start sending frames
  const connectWS = useCallback(() => {
    if (!cameraId || !streamActive) return;
    console.log("[camera] connecting WS to", `${WS_BASE}/ws/camera/${cameraId}/stream`);
    setWsStatus("connecting");

    const ws = new WebSocket(`${WS_BASE}/ws/camera/${cameraId}/stream`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      // Send frames at ~5 fps
      frameIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;
        canvas.width = video.videoWidth;
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
        if (data.events) {
          const mapped: DetectionResult[] = data.events.map(
            (ev: { event_type: string; employee: string; confidence: number | null }, i: number) => ({
              id: `${Date.now()}-${i}`,
              event_type: ev.event_type as EventType,
              employee: ev.employee,
              confidence: ev.confidence,
            }),
          );
          setLastEvent(mapped[0] ?? null);
          setDetections((prev) => [...mapped, ...prev].slice(0, 20));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => {
      setWsStatus("disconnected");
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [cameraId, streamActive]);

  function disconnectWS() {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    wsRef.current?.close();
    setWsStatus("disconnected");
    setLastEvent(null);
  }

  // Auto-connect when camera is ready — replace the manual connect button
  useEffect(() => {
    if (!cameraId || !streamActive) return;
    if (hasConnected.current) return;
    hasConnected.current = true;
    console.log("[camera] connecting WS to", `${WS_BASE}/ws/camera/${cameraId}/stream`);
    connectWS();
    return () => {
      hasConnected.current = false;
      disconnectWS();
    };
  }, [cameraId, streamActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventColor: Record<EventType, string> = {
    clock_in: "var(--clock-in)",
    clock_out: "var(--clock-out)",
    duplicate: "var(--duplicate)",
    ignored: "var(--ignored)",
    unknown: "var(--unknown)",
  };

  return (
    <AppShell>
      <div className="p-6 max-w-[1200px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              {cameraName}
            </h1>
            <p className="text-sm text-muted-foreground capitalize mt-0.5">
              Direction: {cameraDirection || "—"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* WS status */}
            <div className="flex items-center gap-1.5">
              {wsStatus === "connected" ? (
                <Wifi className="w-4 h-4 text-[var(--clock-in)]" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground capitalize">{wsStatus}</span>
            </div>
          </div>
        </div>

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

            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Overlay: last event toast */}
            {lastEvent && wsStatus === "connected" && (
              <div
                className="absolute top-4 left-4 right-4 flex items-center gap-3 rounded-lg px-4 py-3 border backdrop-blur-sm"
                style={{
                  background: `color-mix(in srgb, ${eventColor[lastEvent.event_type]} 8%, transparent)`,
                  borderColor: `${eventColor[lastEvent.event_type]}30`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                  style={{ background: eventColor[lastEvent.event_type] }}
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
          </div>

          {/* Detection log */}
          <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-sm font-medium text-foreground">Detection Log</p>
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

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </AppShell>
  );
}
