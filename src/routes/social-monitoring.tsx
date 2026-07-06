import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Instagram, Youtube, Facebook, Twitter, Music2, Linkedin, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/social-monitoring")({
  head: () => ({ meta: [{ title: "Social Monitoring — Eterna AI" }, { name: "description", content: "Mentions, viral posts and trending threats across social platforms." }] }),
  component: SocialMonitoringPage,
});

const PLATFORMS = [
  { id: "Instagram", icon: Instagram },
  { id: "YouTube", icon: Youtube },
  { id: "Facebook", icon: Facebook },
  { id: "X", icon: Twitter },
  { id: "TikTok", icon: Music2 },
  { id: "LinkedIn", icon: Linkedin },
];

function SocialMonitoringPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("discovered_matches")
      .select("id,video_title,source_url,platform,final_confidence_score,violation_category,discovered_at,preview_url")
      .in("platform", PLATFORMS.map((p) => p.id))
      .eq("user_id", user.id)
      .order("final_confidence_score", { ascending: false })
      .limit(300)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  const byPlatform = Object.fromEntries(PLATFORMS.map((p) => [p.id, rows.filter((r) => r.platform === p.id)]));

  return (
    <AppShell title="Social Monitoring">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            const list = byPlatform[p.id] ?? [];
            const viral = list.filter((r) => (r.final_confidence_score ?? 0) >= 70).length;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{p.id}</div>
                <div className="mt-2 font-display text-2xl font-bold">{list.length}</div>
                <div className="text-[11px] text-muted-foreground">{viral} viral / high-risk</div>
              </div>
            );
          })}
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">Trending threats</div>
          <ul className="divide-y divide-border">
            {rows.slice(0, 40).map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                {r.preview_url ? <img src={r.preview_url} alt="" className="h-10 w-16 rounded object-cover" /> : <div className="h-10 w-16 rounded bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.video_title}</div>
                  <div className="text-xs text-muted-foreground">{r.platform} · {r.violation_category ?? "—"}</div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{r.final_confidence_score ?? 0}</span>
                <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
              </li>
            ))}
            {!rows.length && <li className="p-8 text-center text-sm text-muted-foreground">No social findings yet.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
