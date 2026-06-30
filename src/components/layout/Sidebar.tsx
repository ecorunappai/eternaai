import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShieldCheck,
  FileStack,
  ScanSearch,
  AlertOctagon,
  Gavel,
  Award,
  Crown,
  Sparkles,
  Settings,
  LogOut,
} from "lucide-react";
import type { ComponentType } from "react";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; badge?: string };

const primary: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/registry", label: "Content Registry", icon: FileStack },
  { to: "/monitoring", label: "AI Monitoring", icon: ScanSearch },
  { to: "/violations", label: "Violations", icon: AlertOctagon, badge: "12" },
  { to: "/enforcement", label: "Enforcement", icon: Gavel },
  { to: "/certificates", label: "Certificates", icon: Award },
  { to: "/identity", label: "Digital Identity", icon: ShieldCheck },
];

const secondary: NavItem[] = [
  { to: "/elite", label: "Elite Protection", icon: Crown },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border">
        <div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--gradient-violet)" }}>
          <ShieldCheck className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-semibold text-sidebar-foreground">Eterna AI</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Digital Protection</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Protect
        </div>
        <ul className="space-y-1">
          {primary.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0] shadow-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Platform
        </div>
        <ul className="space-y-1">
          {secondary.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="m-3 rounded-xl border border-sidebar-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Crown className="h-3.5 w-3.5" />
          Elite Protection
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Dedicated analysts, priority enforcement & legal coordination.
        </p>
        <button className="mt-3 w-full rounded-md py-2 text-xs font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          Upgrade — ₹50,000/qtr
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
          AR
        </div>
        <div className="flex-1 leading-tight">
          <div className="text-sm font-medium text-sidebar-foreground">Arjun Rao</div>
          <div className="text-[11px] text-muted-foreground">Elite Member</div>
        </div>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
