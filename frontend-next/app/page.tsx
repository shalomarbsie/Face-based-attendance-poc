"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanFace } from "lucide-react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-foreground/10 mb-4">
            <ScanFace className="w-6 h-6 text-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            Attendance System
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--unknown)] bg-[var(--unknown-bg)] border border-[var(--unknown)]/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-foreground text-background rounded-md px-3 py-2.5 text-sm font-medium hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
