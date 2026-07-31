"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Camera, CheckCircle, XCircle, Trash2, AlertCircle } from "lucide-react";
import { registerEmployee } from "@/lib/api";

const MIN_SAMPLES = 5;
const MAX_SAMPLES = 12;

interface Capture {
  id: string;
  dataUrl: string;
  blob: Blob;
}

export default function RegisterPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [captures, setCaptures] = useState<Capture[]>([]);
  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Start webcam
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamReady(true);
        }
      })
      .catch(() =>
        setStreamError("Camera access denied. Please allow webcam access in your browser."),
      );
    return () => {
      if (videoRef.current?.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const capture = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const id = `${Date.now()}-${Math.random()}`;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCaptures((prev) => [...prev, { id, dataUrl, blob }]);
      },
      "image/jpeg",
      0.85,
    );
  }, []);

  const removeCapture = (id: string) => {
    setCaptures((prev) => prev.filter((c) => c.id !== id));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (captures.length < MIN_SAMPLES) return;
    setSubmitting(true);
    setResult(null);
    try {
      const files = captures.map(
        (c, i) => new File([c.blob], `face-${i}.jpg`, { type: "image/jpeg" }),
      );
      const res = await registerEmployee(fullName.trim(), email.trim(), files);
      setResult({
        success: true,
        message: `${res.full_name} registered successfully with ${res.samples} face samples.`,
      });
      // Reset form
      setCaptures([]);
      setFullName("");
      setEmail("");
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Registration failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = fullName.trim().length > 0 && captures.length >= MIN_SAMPLES && !submitting;
  const progress = Math.min((captures.length / MIN_SAMPLES) * 100, 100);

  return (
    <AppShell>
      <div className="p-6 max-w-[960px] mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            Register Employee
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capture {MIN_SAMPLES}–{MAX_SAMPLES} face samples for recognition training
          </p>
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-5">
          {/* Left: Camera + captures */}
          <div className="space-y-4">
            {/* Camera view */}
            <div className="bg-card border border-border rounded-xl overflow-hidden aspect-video relative">
              {streamError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <AlertCircle className="w-8 h-8 text-[var(--unknown)]" />
                  <p className="text-sm text-[var(--unknown)]">{streamError}</p>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  {!streamReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card">
                      <div className="w-5 h-5 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
                    </div>
                  )}
                  {/* Guide overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-48 rounded-full border-2 border-dashed border-foreground/20" />
                  </div>
                </>
              )}
            </div>

            {/* Capture button + progress */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={capture}
                disabled={!streamReady || captures.length >= MAX_SAMPLES}
                className="w-full flex items-center justify-center gap-2 bg-foreground text-background rounded-lg py-3 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Camera className="w-4 h-4" />
                Capture Sample ({captures.length}/{MAX_SAMPLES})
              </button>

              {/* Progress bar */}
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background:
                      captures.length >= MIN_SAMPLES
                        ? "var(--clock-in)"
                        : "var(--duplicate)",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {captures.length < MIN_SAMPLES
                  ? `${MIN_SAMPLES - captures.length} more sample${MIN_SAMPLES - captures.length !== 1 ? "s" : ""} needed`
                  : `${captures.length} samples ready — you can capture more for better accuracy`}
              </p>
            </div>

            {/* Captures grid */}
            {captures.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {captures.map((c, i) => (
                  <div key={c.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.dataUrl}
                      alt={`Face sample ${i + 1}`}
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <button
                      onClick={() => removeCapture(c.id)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5"
                      aria-label="Remove sample"
                    >
                      <Trash2 className="w-3 h-3 text-[var(--unknown)]" />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-background/70 rounded px-1 text-[9px] font-mono text-foreground">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Employee info form */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 h-fit">
            <p className="text-sm font-medium text-foreground">Employee Details</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="fullName"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Full Name <span className="text-[var(--unknown)]">*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="emailField"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Email (optional)
                </label>
                <input
                  id="emailField"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
                />
              </div>

              {/* Sample status */}
              <div className="flex items-center gap-2 py-2">
                {captures.length >= MIN_SAMPLES ? (
                  <CheckCircle className="w-4 h-4 text-[var(--clock-in)] shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span
                  className={`text-xs ${
                    captures.length >= MIN_SAMPLES
                      ? "text-[var(--clock-in)]"
                      : "text-muted-foreground"
                  }`}
                >
                  {captures.length} / {MIN_SAMPLES} min. samples captured
                </span>
              </div>

              {result && (
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs border ${
                    result.success
                      ? "bg-[var(--clock-in-bg)] text-[var(--clock-in)] border-[var(--clock-in)]/20"
                      : "bg-[var(--unknown-bg)] text-[var(--unknown)] border-[var(--unknown)]/20"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  )}
                  {result.message}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-foreground text-background rounded-md px-3 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Registering…" : "Register Employee"}
              </button>
            </form>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </AppShell>
  );
}
