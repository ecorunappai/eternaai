import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Newspaper, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/news-monitoring")({
  head: () => ({ meta: [{ title: "News Monitoring — Eterna AI" }, { name: "description", content: "Track news, blogs, forums and public discussions mentioning you." }] }),
  component: NewsMonitoringPage,
});

function NewsMonitoringPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("discovered_matches")
      .select("id,video_title,source_url,platform,final_confidence_score,violation_category,discovered_at,notes")
      .in("platform", ["News", "Blog", "Website", "Reddit"])
      .eq("user_id", user.id)
      .order("final_confidence_score", { ascending: false })
      .limit(200)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  const buckets = {
    negative: rows.filter((r) => (r.final_confidence_score ?? 0) >= 60),
    neutral: rows.filter((r) => (r.final_confidence_score ?? 0) >= 30 && (r.final_confidence_score ?? 0) < 60),
    positive: rows.filter((r) => (r.final_confidence_score ?? 0) < 30),
  };

  return (
    <AppShell title="News Monitoring">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Newspaper className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">News, Blogs & Forums</h1>
            <p className="text-sm text-muted-foreground">Sentiment-classified mentions from news sites, blogs, forums and Reddit.</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-4">
          <Stat label="Negative" value={buckets.negative.length} tone="neg" />
          <Stat label="Neutral" value={buckets.neutral.length} tone="mid" />
          <Stat label="Positive / Low-Risk" value={buckets.positive.length} tone="pos" />
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">Highest-risk items</div>
          <ul className="divide-y divide-border">
            {rows.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                <span className={`h-2 w-2 rounded-full ${
                  (r.final_confidence_score ?? 0) >= 60 ? "bg-destructive" :
                  (r.final_confidence_score ?? 0) >= 30 ? "bg-amber-500" : "bg-emerald-500"
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.video_title}</div>
                  <div className="text-xs text-muted-foreground">{r.platform} · {r.violation_category ?? "—"} · {new Date(r.discovered_at ?? Date.now()).toLocaleDateString()}</div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{r.final_confidence_score ?? 0}</span>
                <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
              </li>
            ))}
            {!rows.length && <li className="p-8 text-center text-sm text-muted-foreground">No news items yet — run a scan from the Threat Scanner.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "pos" | "mid" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "mid" ? "text-amber-500" : "text-destructive";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
