import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Activity, ShieldAlert, Radar, Newspaper, Youtube, Instagram, Globe, MessagesSquare, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "Threat Monitoring — Eterna AI" }, { name: "description", content: "Live reputation monitoring dashboard with real-time scan statistics." }] }),
  component: MonitoringDashboard,
});

type Row = {
  platform: string | null;
  final_confidence_score: number | null;
  violation_category: string | null;
  risk_level: string | null;
  created_at: string;
};

type Job = { status: string; last_run_at: string | null; next_run_at: string | null; run_count: number | null };

const SOCIAL = new Set(["Instagram", "YouTube", "Facebook", "X", "TikTok", "LinkedIn"]);
const NEWSY = new Set(["News", "Blog", "Website", "Reddit"]);

function MonitoringDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: m }, { data: j }] = await Promise.all([
        supabase.from("discovered_matches")
          .select("platform,final_confidence_score,violation_category,risk_level,created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(2000),
        supabase.from("monitoring_jobs")
          .select("status,last_run_at,next_run_at,run_count").eq("user_id", user.id),
      ]);
      setRows((m ?? []) as Row[]);
      setJobs((j ?? []) as Job[]);
    })();
  }, [user]);

  const total = rows.length;
  const high = rows.filter((r) => (r.final_confidence_score ?? 0) >= 70).length;
  const med = rows.filter((r) => { const s = r.final_confidence_score ?? 0; return s >= 40 && s < 70; }).length;
  const low = rows.filter((r) => (r.final_confidence_score ?? 0) < 40).length;
  const critical = rows.filter((r) => (r.final_confidence_score ?? 0) >= 85).length;

  const byPlatform = rows.reduce<Record<string, number>>((a, r) => { const p = r.platform ?? "Other"; a[p] = (a[p] ?? 0) + 1; return a; }, {});
  const social = Object.entries(byPlatform).filter(([p]) => SOCIAL.has(p)).reduce((s, [, n]) => s + n, 0);
  const newsish = Object.entries(byPlatform).filter(([p]) => NEWSY.has(p)).reduce((s, [, n]) => s + n, 0);
  const videos = (byPlatform["YouTube"] ?? 0) + (byPlatform["TikTok"] ?? 0);
  const forums = byPlatform["Reddit"] ?? 0;
  const blogs = byPlatform["Blog"] ?? 0;
  const sites = byPlatform["Website"] ?? 0;
  const distinctSources = Object.keys(byPlatform).length;

  const active = jobs.filter((j) => j.status === "active" || j.status === "running").length;
  const running = jobs.filter((j) => j.status === "running").length;
  const lastScan = jobs.map((j) => j.last_run_at).filter(Boolean).sort().reverse()[0];
  const nextScan = jobs.map((j) => j.next_run_at).filter(Boolean).sort()[0];
  const totalRuns = jobs.reduce((s, j) => s + (j.run_count ?? 0), 0);
  const coverage = jobs.length ? Math.round((active / jobs.length) * 100) : (total > 0 ? 100 : 0);

  return (
    <AppShell title="Threat Monitoring">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Activity className="h-5 w-5" /></div>
            <div>
              <h1 className="font-display text-2xl font-semibold">Monitoring Dashboard</h1>
              <p className="text-sm text-muted-foreground">Live reputation intelligence across all connected sources.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${active > 0 ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
              {active > 0 ? `Active · ${active} job${active === 1 ? "" : "s"}` : "Idle"}
            </span>
            {running > 0 && <span className="text-xs text-primary font-medium">{running} scanning…</span>}
          </div>
        </header>

        {/* Status panel */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Info icon={CheckCircle2} label="Monitoring Jobs" value={jobs.length} sub={`${active} active`} />
            <Info icon={Activity} label="Total Scans Run" value={totalRuns} sub={`${running} running now`} />
            <Info icon={Clock} label="Last Scan" value={lastScan ? new Date(lastScan).toLocaleString() : "Never"} />
            <Info icon={Clock} label="Next Scan" value={nextScan ? new Date(nextScan).toLocaleString() : "On demand"} />
          </div>
        </section>

        {/* Source stats */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4 flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Sources scanned</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Src label="Total" value={total} />
            <Src icon={Newspaper} label="News" value={newsish} />
            <Src icon={Instagram} label="Social" value={social} />
            <Src icon={Youtube} label="Video" value={videos} />
            <Src icon={MessagesSquare} label="Forums" value={forums} />
            <Src label="Blogs" value={blogs} />
            <Src label="Websites" value={sites} />
          </div>
          <div className="mt-4 text-xs text-muted-foreground">Coverage across {distinctSources} distinct platform{distinctSources === 1 ? "" : "s"}.</div>
        </section>

        {/* Threat stats */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" /> Threats detected</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Threat label="Total" value={total} tone="mid" />
            <Threat label="Critical" value={critical} tone="crit" />
            <Threat label="High Risk" value={high} tone="neg" />
            <Threat label="Medium Risk" value={med} tone="mid" />
            <Threat label="Low Risk" value={low} tone="pos" />
          </div>
        </section>

        {/* Coverage bar */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm font-medium mb-3"><span>Monitoring coverage</span><span className="tabular-nums">{coverage}%</span></div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary" style={{ width: `${coverage}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
            <span>{active} active</span>
            <span className="text-center">{jobs.length - active} idle</span>
            <span className="text-right">{jobs.length} total jobs</span>
          </div>
        </section>

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: "/threat-radar", icon: Radar, label: "Threat Radar" },
            { to: "/news-monitoring", icon: Newspaper, label: "News" },
            { to: "/social-monitoring", icon: Instagram, label: "Social" },
            { to: "/reputation-score", icon: Activity, label: "Reputation Score" },
          ].map((l) => {
            const Icon = l.icon;
            return (
              <Link key={l.to} to={l.to} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                <span className="text-sm font-medium">{l.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function Info({ icon: Icon, label, value, sub }: { icon: any; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}
function Src({ icon: Icon, label, value }: { icon?: any; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
function Threat({ label, value, tone }: { label: string; value: number; tone: "pos" | "mid" | "neg" | "crit" }) {
  const c = tone === "crit" ? "text-destructive" : tone === "neg" ? "text-orange-500" : tone === "mid" ? "text-amber-500" : "text-emerald-500";
  return (
    <div className="rounded-xl border border-border bg-background/50 p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
