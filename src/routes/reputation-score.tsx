import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Gauge, TrendingUp, TrendingDown, Newspaper, ShieldCheck, Youtube, UserX, Copyright } from "lucide-react";

export const Route = createFileRoute("/reputation-score")({
  head: () => ({
    meta: [
      { title: "Reputation Score — Eterna AI" },
      { name: "description", content: "Live reputation health score aggregated from all monitored channels." },
    ],
  }),
  component: ReputationScorePage,
});

type Counters = {
  positiveNews: number; verifiedAccounts: number;
  negativeVideos: number; impersonation: number; copyright: number;
  totalRisky: number; avgScore: number;
};

function ReputationScorePage() {
  const { user } = useAuth();
  const [c, setC] = useState<Counters | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: matches } = await supabase.from("discovered_matches")
        .select("platform,violation_category,final_confidence_score,fair_use_flag").eq("user_id", user.id);
      const list = matches ?? [];
      const negativeVideos = list.filter((m) => m.platform === "YouTube").length;
      const impersonation = list.filter((m) => /impersonat|fake_profile/i.test(m.violation_category ?? "")).length;
      const copyright = list.filter((m) => /reupload|copyright|thumbnail_misuse/i.test(m.violation_category ?? "")).length;
      const totalRisky = list.filter((m) => (m.final_confidence_score ?? 0) >= 41).length;
      const avgScore = list.length ? Math.round(list.reduce((s, m) => s + (m.final_confidence_score ?? 0), 0) / list.length) : 0;
      const { count: assetCount } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setC({
        positiveNews: 0, verifiedAccounts: assetCount ?? 0,
        negativeVideos, impersonation, copyright, totalRisky, avgScore,
      });
    })();
  }, [user]);

  // Score: 100 - weighted risk penalty
  const score = c ? Math.max(0, 100 - Math.min(80, Math.round(c.totalRisky * 1.5 + c.impersonation * 3 + c.avgScore * 0.3))) : null;
  const band = score === null ? "—" : score >= 80 ? "LOW RISK" : score >= 60 ? "MODERATE" : score >= 40 ? "HIGH RISK" : "CRITICAL";
  const bandColor = score === null ? "text-muted-foreground" : score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : score >= 40 ? "text-orange-500" : "text-destructive";

  return (
    <AppShell title="Reputation Score">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 items-center">
            <div className="relative grid place-items-center">
              <svg className="h-56 w-56 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="url(#grad)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(score ?? 0) * 2.76} 1000`} />
                <defs>
                  <linearGradient id="grad" x1="0" x2="1">
                    <stop offset="0" stopColor="hsl(var(--primary))" /><stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="font-display text-5xl font-bold">{score ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">/ 100</div>
                  <div className={`mt-2 text-xs font-semibold tracking-widest ${bandColor}`}>{band}</div>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-500 font-medium"><TrendingUp className="h-4 w-4" /> Positive signals</div>
              <Row icon={Newspaper} label="Positive News" value={c?.positiveNews ?? 0} tone="pos" />
              <Row icon={ShieldCheck} label="Verified Assets" value={c?.verifiedAccounts ?? 0} tone="pos" />
              <div className="pt-3 flex items-center gap-2 text-sm text-destructive font-medium"><TrendingDown className="h-4 w-4" /> Threats detected</div>
              <Row icon={Youtube} label="Negative Videos" value={c?.negativeVideos ?? 0} tone="neg" />
              <Row icon={UserX} label="Impersonation" value={c?.impersonation ?? 0} tone="neg" />
              <Row icon={Copyright} label="Copyright Violations" value={c?.copyright ?? 0} tone="neg" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground mb-2"><Gauge className="h-4 w-4 text-primary" /> How this is calculated</div>
          Score = 100 minus a weighted penalty over risky items detected across all monitored platforms.
          Impersonation and deepfake findings weigh higher than reaction/troll content. Positive news feed is coming online — connect a news source in <a className="text-primary" href="/news-monitoring">News Monitoring</a> to enrich the score.
        </div>
      </div>
    </AppShell>
  );
}

function Row({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "pos" | "neg" }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-4 py-2.5">
      <Icon className={`h-4 w-4 ${tone === "pos" ? "text-emerald-500" : "text-destructive"}`} />
      <span className="flex-1 text-sm">{label}</span>
      <span className="font-semibold tabular-nums">{tone === "pos" ? "+" : "-"}{value}</span>
    </div>
  );
}
