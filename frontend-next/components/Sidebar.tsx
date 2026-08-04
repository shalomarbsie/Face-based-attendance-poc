"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Camera,
  FileText,
  UserPlus,
  Users,
  LogOut,
  ScanFace,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "hr"] },
  { href: "/camera", label: "Camera", icon: Camera, roles: ["owner", "hr"] },
  { href: "/reports", label: "Reports", icon: FileText, roles: ["owner", "hr"] },
  { href: "/register", label: "Register Employee", icon: UserPlus, roles: ["owner", "hr"] },
  { href: "/hr", label: "HR Management", icon: Users, roles: ["owner"] }, // owner only
];

interface Props {
  userName?: string;
  userRole?: string;
}

export function Sidebar({ userName, userRole }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore
    }
    router.push("/");
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-sidebar border-r border-border h-screen sticky top-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-foreground/10">
          <ScanFace className="w-4 h-4 text-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-foreground tracking-tight">
            Attendance
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">
            Face Rec
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {NAV_ITEMS.filter((item) => !userRole || item.roles.includes(userRole)).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-foreground/10 text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="border-t border-border px-3 py-3">
        {userName && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Log out
        </button>
      </div>
    </aside>
  );
}
