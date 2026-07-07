import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Radio } from "lucide-react";
import { Radar as RRadar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/threat-radar")({
  head: () => ({ meta: [{ title: "Threat Radar — Eterna AI" }, { name: "description", content: "Live reputation threat radar: heatmap of platform activity, threat categories and severity." }] }),
  component: ThreatRadarPage,
});

const CATEGORIES = [
  { id: "defamation", label: "Defamation", match: /defam|slander|libel/i },
  { id: "harassment", label: "Harassment", match: /harass|bully|abuse|insult/i },
  { id: "hate", label: "Hate Speech", match: /hate|racis|slur/i },
  { id: "deepfake", label: "Deepfake", match: /deepfake|ai_generated|morphed|face_image_misuse/i },
  { id: "impersonation", label: "Impersonation", match: /impersonat|fake_celebrity|fake_profile|identity_/i },
  { id: "copyright", label: "Copyright", match: /reupload|copyright|thumbnail_misuse/i },
  { id: "brand", label: "Brand Misuse", match: /brand/i },
  { id: "ads", label: "Unauthorized Ads", match: /advert|endorsement|commercial|promo_misuse/i },
  { id: "scam", label: "Scam Association", match: /scam|fraud|phish/i },
] as const;

const PLATFORMS = ["YouTube","Instagram","Facebook","TikTok","X","Reddit","News","Blog","Website","Forum"];

function ThreatRadarPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("discovered_matches")
      .select("id,video_title,source_url,platform,violation_category,final_confidence_score,preview_url")
      .eq("user_id", user.id).limit(2000)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  const platformData = useMemo(() => {
    const max = Math.max(1, ...PLATFORMS.map((p) => rows.filter((r) => r.platform === p).length));
    return PLATFORMS.map((p) => {
      const list = rows.filter((r) => r.platform === p);
      return { name: p, value: Math.round((list.length / max) * 100), count: list.length };
    });
  }, [rows]);

  const catData = useMemo(() => {
    return CATEGORIES.map((c) => {
      const list = rows.filter((r) => c.match.test(`${r.violation_category ?? ""} ${r.video_title ?? ""}`));
      const avg = list.length ? Math.round(list.reduce((s, r) => s + (r.final_confidence_score ?? 0), 0) / list.length) : 0;
      return { id: c.id, name: c.label, count: list.length, severity: avg, value: Math.max(list.length * 5, avg) };
    });
  }, [rows]);

  const evidence = useMemo(() => {
    if (!active) return [] as any[];
    const cat = CATEGORIES.find((c) => c.id === active);
    if (!cat) return [];
    return rows.filter((r) => cat.match.test(`${r.violation_category ?? ""} ${r.video_title ?? ""}`))
      .sort((a, b) => (b.final_confidence_score ?? 0) - (a.final_confidence_score ?? 0)).slice(0, 20);
  }, [active, rows]);

  return (
    <AppShell title="Threat Radar">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Radio className="h-5 w-5 animate-pulse" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Threat Radar</h1>
            <p className="text-sm text-muted-foreground">Interactive radar: platform intensity, threat category severity and volume.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="text-sm font-medium mb-2">Platform intensity</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={platformData} outerRadius="75%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(_v, _n, p: any) => [`${p.payload.count} findings`, p.payload.name]} />
                  <RRadar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="text-sm font-medium mb-2">Threat categories</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={catData} outerRadius="75%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(_v, _n, p: any) => [`${p.payload.count} · sev ${p.payload.severity}`, p.payload.name]} />
                  <RRadar dataKey="value" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-3">Click a category to open matching evidence</div>
          <div className="flex flex-wrap gap-2">
            {catData.map((c) => {
              const isActive = active === c.id;
              const level = c.severity >= 70 ? "HIGH" : c.severity >= 40 ? "MED" : c.count > 0 ? "LOW" : "—";
              const color = level === "HIGH" ? "text-destructive" : level === "MED" ? "text-amber-500" : level === "LOW" ? "text-emerald-500" : "text-muted-foreground";
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(isActive ? null : c.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${isActive ? "border-primary bg-primary/10" : "border-border bg-background/50 hover:border-primary/50"}`}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">{c.count}</span>
                    <span className={color}>{level}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {active && (
            <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
              {evidence.map((r) => (
                <li key={r.id} className="flex items-center gap-4 px-4 py-3">
                  {r.preview_url ? <img src={r.preview_url} alt="" className="h-10 w-16 rounded object-cover" /> : <div className="h-10 w-16 rounded bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.video_title ?? r.source_url}</div>
                    <div className="text-xs text-muted-foreground">{r.platform} · {r.violation_category ?? "—"}</div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{r.final_confidence_score ?? 0}</span>
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open</a>
                </li>
              ))}
              {!evidence.length && <li className="p-6 text-center text-sm text-muted-foreground">No evidence in this category yet.</li>}
            </ul>
          )}
        </section>

        <div className="text-xs text-muted-foreground">
          Data source: <Link to="/violations" className="text-primary">Threat Center</Link> · Run new scans from <Link to="/threat-scanner" className="text-primary">Threat Scanner</Link>.
        </div>
      </div>
    </AppShell>
  );
}
