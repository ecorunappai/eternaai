import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/threat-radar")({
  head: () => ({ meta: [{ title: "Threat Radar — Eterna AI" }, { name: "description", content: "Live reputation threat radar: heatmap of platform activity, trending attacks and viral content." }] }),
  component: ThreatRadarPage,
});

const CATS = [
  { id: "reputation", label: "Reputation" },
  { id: "copyright", label: "Copyright" },
  { id: "impersonation", label: "Impersonation" },
  { id: "deepfake", label: "Deepfake" },
  { id: "brand", label: "Brand Abuse" },
  { id: "ads", label: "Unauthorized Ads" },
];

function classify(cat: string): string {
  if (/deepfake/.test(cat)) return "deepfake";
  if (/impersonat|fake_celebrity|identity_/.test(cat)) return "impersonation";
  if (/reupload|copyright|thumbnail_misuse/.test(cat)) return "copyright";
  if (/brand/.test(cat)) return "brand";
  if (/advert|endorsement/.test(cat)) return "ads";
  return "reputation";
}

function ThreatRadarPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("discovered_matches")
      .select("platform,violation_category,final_confidence_score")
      .eq("user_id", user.id)
      .limit(2000)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  const byPlatform = rows.reduce<Record<string, number>>((acc, r) => {
    const p = r.platform ?? "Other";
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  const maxPlatform = Math.max(1, ...Object.values(byPlatform));

  const byCat = rows.reduce<Record<string, { count: number; avg: number; sum: number }>>((acc, r) => {
    const c = classify(r.violation_category ?? "");
    if (!acc[c]) acc[c] = { count: 0, avg: 0, sum: 0 };
    acc[c].count++;
    acc[c].sum += r.final_confidence_score ?? 0;
    acc[c].avg = Math.round(acc[c].sum / acc[c].count);
    return acc;
  }, {});

  return (
    <AppShell title="Threat Radar">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Radio className="h-5 w-5 animate-pulse" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Threat Radar</h1>
            <p className="text-sm text-muted-foreground">Live intelligence view: platform intensity + threat category severity.</p>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="text-sm font-medium mb-4">Platform intensity</div>
          <div className="space-y-2">
            {Object.entries(byPlatform).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
              <div key={p} className="grid grid-cols-[120px_1fr_50px] items-center gap-3">
                <div className="text-sm">{p}</div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50" style={{ width: `${(n / maxPlatform) * 100}%` }} />
                </div>
                <div className="text-right tabular-nums text-sm font-semibold">{n}</div>
              </div>
            ))}
            {!Object.keys(byPlatform).length && <div className="p-4 text-center text-sm text-muted-foreground">Run a scan to populate the radar.</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="text-sm font-medium mb-4">Threat categories</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CATS.map((c) => {
              const d = byCat[c.id] ?? { count: 0, avg: 0, sum: 0 };
              const level = d.avg >= 70 ? "HIGH" : d.avg >= 40 ? "MEDIUM" : d.count > 0 ? "LOW" : "—";
              const color = level === "HIGH" ? "text-destructive" : level === "MEDIUM" ? "text-amber-500" : level === "LOW" ? "text-emerald-500" : "text-muted-foreground";
              return (
                <div key={c.id} className="rounded-xl border border-border bg-background/50 p-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.label}</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-display text-2xl font-bold">{d.count}</div>
                    <div className={`text-xs font-semibold ${color}`}>{level}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
