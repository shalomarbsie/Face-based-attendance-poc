"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UserPlus, CheckCircle, AlertCircle, Shield } from "lucide-react";
import { listAdmins, createHR } from "@/lib/api";
import type { HRUser } from "@/lib/types";

export default function HRPage() {
  const [users, setUsers] = useState<HRUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ success: boolean; message: string } | null>(null);

  async function fetchUsers() {
    setLoading(true);
    try {
      const data = await listAdmins();
      setUsers(data as HRUser[]);
    } catch {
      // owner-only — may 403
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormResult(null);
    try {
      await createHR(fullName.trim(), email.trim(), password);
      setFormResult({ success: true, message: `HR user "${fullName.trim()}" created.` });
      setFullName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setFormResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to create user",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const roleBadge = (role: string) => {
    if (role === "owner")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border bg-[var(--clock-out-bg)] text-[var(--clock-out)] border-[var(--clock-out)]/20 uppercase tracking-wide">
          <Shield className="w-2.5 h-2.5" />
          Owner
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border bg-[var(--ignored-bg)] text-[var(--ignored)] border-[var(--ignored)]/20 uppercase tracking-wide">
        HR
      </span>
    );
  };

  return (
    <AppShell requireRole={["owner"]}>
      <div className="p-6 max-w-[800px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              HR Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage HR and admin user accounts
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setFormResult(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add HR User
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-medium text-foreground mb-4">New HR User</p>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="hrName"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Full Name
                </label>
                <input
                  id="hrName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="hrEmail"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Email
                </label>
                <input
                  id="hrEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label
                  htmlFor="hrPassword"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Password
                </label>
                <input
                  id="hrPassword"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a secure password"
                  className="w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              {formResult && (
                <div
                  className={`col-span-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs border ${
                    formResult.success
                      ? "bg-[var(--clock-in-bg)] text-[var(--clock-in)] border-[var(--clock-in)]/20"
                      : "bg-[var(--unknown-bg)] text-[var(--unknown)] border-[var(--unknown)]/20"
                  }`}
                >
                  {formResult.success ? (
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {formResult.message}
                </div>
              )}

              <div className="col-span-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-secondary border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-foreground text-background rounded-md text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* User list */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <UserPlus className="w-8 h-8 opacity-20" />
              <p className="text-sm">No admin users found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["User", "Email", "Role", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-foreground/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-semibold text-foreground">
                            {u.full_name[0]?.toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border uppercase tracking-wide ${
                          u.status === "active"
                            ? "bg-[var(--clock-in-bg)] text-[var(--clock-in)] border-[var(--clock-in)]/20"
                            : "bg-[var(--ignored-bg)] text-[var(--ignored)] border-[var(--ignored)]/20"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
