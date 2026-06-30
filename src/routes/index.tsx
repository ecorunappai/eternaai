import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CheckCircle2, FileStack, Gavel, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Eterna AI" }] }),
  component: Dashboard,
});

const trend = Array.from({ length: 14 }, (_, i) => ({ d: `D${i + 1}`, detections: 20 + Math.round(Math.sin(i / 2) * 18 + i * 3), takedowns: 12 + Math.round(Math.cos(i / 2) * 8 + i * 2) }));
const PIE = ["hsl(267 83% 60%)", "hsl(258 90% 66%)", "hsl(220 70% 55%)", "hsl(160 60% 45%)", "hsl(30 90% 55%)"];

function Stat({ label, value, delta, icon: Icon, tone = "primary" }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-lg bg-${tone}/10`}><Icon className={`h-5 w-5 text-${tone}`} /></div>
        {delta && <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><ArrowUpRight className="h-3.5 w-3.5" />{delta}</div>}
      </div>
      <div className="mt-4 font-display text-3xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ assets: 0, violations: 0, certs: 0, identities: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [a, v, c, i, r] = await Promise.all([
        supabase.from("assets").select("id", { count: "exact", head: true }),
        supabase.from("violations").select("id", { count: "exact", head: true }),
        supabase.from("certificates").select("id", { count: "exact", head: true }),
        supabase.from("identities").select("id", { count: "exact", head: true }),
        supabase.from("violations").select("*").order("detected_at", { ascending: false }).limit(5),
      ]);
      setCounts({ assets: a.count ?? 0, violations: v.count ?? 0, certs: c.count ?? 0, identities: i.count ?? 0 });
      setRecent(r.data ?? []);
    })();
  }, [user]);

  const platform = [
    { name: "Instagram", v: 38 }, { name: "YouTube", v: 24 }, { name: "TikTok", v: 18 }, { name: "X", v: 12 }, { name: "Web", v: 8 },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">Protection Overview</h1>
        <p className="text-sm text-muted-foreground">Live monitoring across 12+ platforms — last 14 days.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Protected Assets" value={counts.assets} delta="+12%" icon={FileStack} tone="primary" />
        <Stat label="Active Violations" value={counts.violations} delta="+5%" icon={ShieldAlert} tone="destructive" />
        <Stat label="Certificates Issued" value={counts.certs} delta="+8%" icon={ShieldCheck} tone="primary" />
        <Stat label="Verified Identities" value={counts.identities} delta="+3%" icon={CheckCircle2} tone="primary" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display text-base font-semibold">Detection & Enforcement Trend</div>
              <div className="text-xs text-muted-foreground">Detections vs. takedowns sent</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(267 83% 60%)" stopOpacity={0.45} /><stop offset="100%" stopColor="hsl(267 83% 60%)" stopOpacity={0} /></linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(160 60% 45%)" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(160 60% 45%)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip />
              <Area type="monotone" dataKey="detections" stroke="hsl(267 83% 60%)" fill="url(#g1)" />
              <Area type="monotone" dataKey="takedowns" stroke="hsl(160 60% 45%)" fill="url(#g2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="font-display text-base font-semibold">By Platform</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={platform} dataKey="v" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                {platform.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="font-display text-base font-semibold mb-3">Recent Violations</div>
          {recent.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No violations yet. Upload content in <a className="text-primary underline" href="/registry">Registry</a> to start monitoring.</div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((v) => (
                <div key={v.id} className="flex items-center gap-3 py-3">
                  <div className={`h-2 w-2 rounded-full ${v.threat_level === "critical" ? "bg-destructive" : v.threat_level === "high" ? "bg-orange-500" : "bg-yellow-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.platform} · {v.infringing_url}</div>
                    <div className="text-xs text-muted-foreground">{new Date(v.detected_at).toLocaleString()} · {v.status}</div>
                  </div>
                  {v.similarity_score && <div className="text-xs font-mono text-muted-foreground">{v.similarity_score}%</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border p-5 text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Sparkles className="h-5 w-5" />
          <div className="mt-3 font-display text-lg font-semibold">Ask Eterna AI</div>
          <p className="mt-1 text-sm text-white/85">Draft DMCA notices, get takedown strategy, and triage cases.</p>
          <a href="/assistant" className="mt-4 inline-flex h-9 items-center rounded-md bg-white px-3 text-xs font-semibold text-primary">Open assistant</a>
        </div>
      </div>
    </AppShell>
  );
}
