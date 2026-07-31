"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { getMe } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

interface Props {
  children: React.ReactNode;
  requireRole?: string[];
}

export function AppShell({ children, requireRole }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((u) => {
        if (requireRole && !requireRole.includes(u.role)) {
          router.push("/dashboard");
          return;
        }
        setUser(u);
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [router, requireRole]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={user.full_name} userRole={user.role} />
      <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
    </div>
  );
}
