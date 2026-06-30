import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileStack,
  Gavel,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eterna AI — Own It. Protect It. Defend It." },
      { name: "description", content: "AI-powered digital protection platform for creators, brands and public figures. Monitor, register and enforce ownership across the internet." },
      { property: "og:title", content: "Eterna AI — Digital Protection Platform" },
      { property: "og:description", content: "Continuously scan the internet for unauthorized use of your content, identity and brand." },
    ],
  }),
  component: Dashboard,
});

const detectionTrend = [
  { m: "Jun", detected: 42, removed: 28 },
  { m: "Jul", detected: 58, removed: 41 },
  { m: "Aug", detected: 71, removed: 55 },
  { m: "Sep", detected: 89, removed: 70 },
  { m: "Oct", detected: 124, removed: 102 },
  { m: "Nov", detected: 156, removed: 138 },
  { m: "Dec", detected: 182, removed: 167 },
];

const platforms = [
  { name: "Instagram", value: 34 },
  { name: "TikTok", value: 22 },
  { name: "YouTube", value: 18 },
  { name: "X", value: 12 },
  { name: "Web", value: 14 },
];

const threats = [
  { name: "Copyright", value: 48, color: "oklch(0.55 0.23 290)" },
  { name: "Impersonation", value: 27, color: "oklch(0.68 0.2 305)" },
  { name: "Defamation", value: 15, color: "oklch(0.7 0.16 75)" },
  { name: "Brand misuse", value: 10, color: "oklch(0.62 0.17 200)" },
];

const violations = [
  { id: "VIO-8821", platform: "Instagram", url: "instagram.com/p/CzM9...", asset: "Hero portrait #214", sim: 96, threat: "High", status: "Enforcement" },
  { id: "VIO-8814", platform: "TikTok", url: "tiktok.com/@user/video/728...", asset: "Brand reel — launch", sim: 92, threat: "Critical", status: "Warning Sent" },
  { id: "VIO-8807", platform: "YouTube", url: "youtube.com/watch?v=Q1aB...", asset: "Podcast ep. 14", sim: 88, threat: "Medium", status: "Under Review" },
  { id: "VIO-8799", platform: "Website", url: "fakecreator-shop.io/products/12", asset: "Product photo set", sim: 99, threat: "Critical", status: "Detected" },
  { id: "VIO-8782", platform: "X", url: "x.com/impostorAcc/status/19...", asset: "Profile identity", sim: 84, threat: "High", status: "Removed" },
];

const threatColor = (t: string) =>
  t === "Critical" ? "bg-destructive/10 text-destructive" :
  t === "High" ? "bg-warning/15 text-warning-foreground" :
  t === "Medium" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground";

const statusColor = (s: string) =>
  s === "Removed" ? "bg-success/15 text-success" :
  s === "Enforcement" ? "bg-primary/10 text-primary" :
  s === "Warning Sent" ? "bg-warning/15 text-warning-foreground" :
  s === "Detected" ? "bg-destructive/10 text-destructive" :
  "bg-muted text-muted-foreground";

function Kpi({ icon: Icon, label, value, delta, positive = true }: { icon: any; label: string; value: string; delta: string; positive?: boolean }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${positive ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
          <TrendingUp className="h-3 w-3" />
          {delta}
        </div>
      </div>
      <div className="mt-4 font-display text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Dashboard() {
  return (
    <AppShell breadcrumb="Dashboard">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border p-6 md:p-8" style={{ background: "var(--gradient-subtle)" }}>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-violet)" }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> All monitoring agents online
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold md:text-4xl">
              Good morning, <span className="gradient-text">Arjun</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Eterna AI scanned <span className="font-semibold text-foreground">412,891</span> sources in the last 24h and surfaced <span className="font-semibold text-destructive">12 new violations</span> requiring your review.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-4 h-10 text-sm font-medium hover:bg-accent">
              <FileStack className="h-4 w-4" /> Register asset
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.55_0.23_290/0.5)]" style={{ background: "var(--gradient-violet)" }}>
              <Sparkles className="h-4 w-4" /> Run full scan
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi icon={ShieldCheck} label="Protected assets" value="2,847" delta="+12.4%" />
        <Kpi icon={ShieldAlert} label="Threats detected (30d)" value="318" delta="+8.1%" positive={false} />
        <Kpi icon={Gavel} label="Takedowns completed" value="194" delta="+22%" />
        <Kpi icon={CheckCircle2} label="Enforcement success" value="91.4%" delta="+3.2%" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Detection Trend */}
        <div className="surface-card p-6 xl:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">Detection trend</h3>
              <p className="text-xs text-muted-foreground">Violations detected vs. content removed</p>
            </div>
            <div className="flex gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />Detected</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1"><span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.62 0.17 155)" }} />Removed</span>
            </div>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={detectionTrend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.55 0.23 290)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.55 0.23 290)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.17 155)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="oklch(0.62 0.17 155)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.92 0.012 285)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="m" stroke="oklch(0.5 0.025 285)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.5 0.025 285)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.012 285)", fontSize: 12 }} />
                <Area type="monotone" dataKey="detected" stroke="oklch(0.55 0.23 290)" strokeWidth={2.5} fill="url(#g1)" />
                <Area type="monotone" dataKey="removed" stroke="oklch(0.62 0.17 155)" strokeWidth={2.5} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Threat categories */}
        <div className="surface-card p-6">
          <h3 className="font-display text-lg font-semibold">Threat categories</h3>
          <p className="text-xs text-muted-foreground">Distribution this quarter</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={threats} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} stroke="none">
                  {threats.map((t, i) => <Cell key={i} fill={t.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.012 285)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-2">
            {threats.map((t) => (
              <li key={t.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </span>
                <span className="font-medium text-muted-foreground">{t.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Platform breakdown */}
        <div className="surface-card p-6">
          <h3 className="font-display text-lg font-semibold">Platform breakdown</h3>
          <p className="text-xs text-muted-foreground">Where violations were found</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platforms}>
                <CartesianGrid stroke="oklch(0.92 0.012 285)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="name" stroke="oklch(0.5 0.025 285)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.5 0.025 285)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.012 285)", fontSize: 12 }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="oklch(0.55 0.23 290)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monitoring agents */}
        <div className="surface-card p-6 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">Live monitoring agents</h3>
              <p className="text-xs text-muted-foreground">Real-time crawl & detection workers</p>
            </div>
            <button className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { name: "Visual Similarity (CLIP)", scope: "Images · Reels · Shorts", load: 78, queue: "12k", state: "Active" },
              { name: "Video Fingerprinting", scope: "YouTube · TikTok", load: 64, queue: "3.4k", state: "Active" },
              { name: "Text & Plagiarism", scope: "Blogs · News · Forums", load: 41, queue: "21k", state: "Active" },
              { name: "Reputation Sentiment", scope: "X · Reddit · Comments", load: 55, queue: "8.7k", state: "Active" },
            ].map((a) => (
              <div key={a.name} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-primary">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">{a.scope}</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> {a.state}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Load</span>
                  <span>{a.queue} queued</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${a.load}%`, background: "var(--gradient-violet)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Violations table */}
      <div className="mt-6 surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-semibold">Recent violations</h3>
            <p className="text-xs text-muted-foreground">Auto-cased by Eterna AI · awaiting your action</p>
          </div>
          <button className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent">
            Open Violation Center
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-semibold">Case</th>
                <th className="px-4 py-3 font-semibold">Platform</th>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Similarity</th>
                <th className="px-4 py-3 font-semibold">Threat</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-6 py-3.5">
                    <div className="font-mono text-xs font-semibold text-foreground">{v.id}</div>
                    <div className="truncate text-[11px] text-muted-foreground max-w-[220px]">{v.url}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs"><Globe className="h-3 w-3 text-muted-foreground" />{v.platform}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs">{v.asset}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${v.sim}%`, background: "var(--gradient-violet)" }} />
                      </div>
                      <span className="text-xs font-medium">{v.sim}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${threatColor(v.threat)}`}>{v.threat}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(v.status)}`}>{v.status}</span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button className="rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
