import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ShieldCheck, FileStack, ScanSearch, AlertOctagon, Gavel,
  Award, Crown, Sparkles, Settings, LogOut, Youtube, Bot, Workflow,
  Radar, Radio, Newspaper, Users, VenetianMask, UserX, Gauge,
  ChevronDown, MoreHorizontal,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; star?: boolean };

const protect: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/registry", label: "Assets", icon: FileStack },
  { to: "/threat-scanner", label: "Threat Scanner", icon: Radar, star: true },
  { to: "/threat-radar", label: "Threat Radar", icon: Radio, star: true },
  { to: "/youtube", label: "Threat Monitoring", icon: ScanSearch },
  { to: "/violations", label: "Threat Center", icon: AlertOctagon },
  { to: "/enforcement", label: "Case Management", icon: Gavel },
  { to: "/takedown", label: "Removal Center", icon: Gavel },
];

const intelligence: NavItem[] = [
  { to: "/reputation-score", label: "Reputation Score", icon: Gauge },
  { to: "/news-monitoring", label: "News Monitoring", icon: Newspaper },
  { to: "/social-monitoring", label: "Social Monitoring", icon: Users },
  { to: "/deepfake", label: "Deepfake Detection", icon: VenetianMask },
  { to: "/impersonation", label: "Impersonation Detection", icon: UserX },
];

const platform: NavItem[] = [
  { to: "/elite", label: "Elite Protection", icon: Crown },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles },
];

const more: NavItem[] = [
  { to: "/matching", label: "Detection Engine", icon: ScanSearch },
  { to: "/monitoring-jobs", label: "Auto-Monitoring", icon: Workflow },
  { to: "/browser-agent", label: "Investigation Agent", icon: Bot },
  { to: "/agent-console", label: "Agent Console", icon: Workflow },
  { to: "/certificates", label: "Certificates", icon: Award },
  { to: "/identity", label: "Digital Identity", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavRow({ item, active, badge }: { item: NavItem; active: boolean; badge?: string }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0] shadow-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.star && <span className="text-[10px] text-amber-400">★</span>}
      {badge && (
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const { user } = useAuth();
  const [violationCount, setViolationCount] = useState<number>(0);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const moreActive = more.some((m) => m.to === pathname);
  const [moreOpen, setMoreOpen] = useState<boolean>(moreActive);

  useEffect(() => {
    if (!user) return;
    supabase.from("violations").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]).then(({ count }) => setViolationCount(count ?? 0));
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user]);

  useEffect(() => { if (moreActive) setMoreOpen(true); }, [moreActive]);

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  }

  const initials = (profile?.full_name ?? user?.email ?? "??").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();

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
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Protect</div>
        <ul className="space-y-1">
          {protect.map((item) => (
            <li key={item.to}>
              <NavRow
                item={item}
                active={pathname === item.to}
                badge={item.to === "/violations" && violationCount > 0 ? String(violationCount) : undefined}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6 px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Intelligence</div>
        <ul className="space-y-1">
          {intelligence.map((item) => (
            <li key={item.to}><NavRow item={item} active={pathname === item.to} /></li>
          ))}
        </ul>

        <div className="mt-6 px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Platform</div>
        <ul className="space-y-1">
          {platform.map((item) => (
            <li key={item.to}><NavRow item={item} active={pathname === item.to} /></li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={`w-full group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                moreActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60"
              }`}
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <span className="flex-1 text-left">More</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <ul className="mt-1 space-y-1 border-l border-sidebar-border/60 pl-2 ml-4">
                {more.map((item) => (
                  <li key={item.to}><NavRow item={item} active={pathname === item.to} /></li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      </nav>

      <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">{initials}</div>
        <div className="flex-1 leading-tight min-w-0">
          <div className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name ?? user?.email}</div>
          <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
        </div>
        <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
