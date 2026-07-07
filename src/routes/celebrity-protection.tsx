import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Crown, Image as ImageIcon, Film, Mic, BadgeCheck, Megaphone, VenetianMask, Copyright, UserX, ExternalLink, ShieldAlert, FileSearch, Gavel } from "lucide-react";

export const Route = createFileRoute("/celebrity-protection")({
  head: () => ({ meta: [{ title: "Celebrity Protection — Eterna AI" }, { name: "description", content: "Protect celebrity assets: official photos, movies, voice, logos and endorsements from unauthorized use." }] }),
  component: CelebrityProtection,
});

const ASSET_TYPES = [
  { key: "image", icon: ImageIcon, label: "Official Photos" },
  { key: "video", icon: Film, label: "Movies & Scenes" },
  { key: "audio", icon: Mic, label: "Voice Samples" },
  { key: "logo", icon: BadgeCheck, label: "Logos & Marks" },
  { key: "interview", icon: Megaphone, label: "Interviews & Press" },
];

const DETECTION = [
  { match: (c: string) => /reupload|copyright|thumbnail_misuse/i.test(c), icon: Copyright, label: "Re-uploaded Content", tone: "text-orange-500" },
  { match: (c: string) => /advert|endorsement|commercial/i.test(c), icon: Megaphone, label: "Unauthorized Advertising", tone: "text-destructive" },
  { match: (c: string) => /deepfake|ai_generated|face_image_misuse|morphed/i.test(c), icon: VenetianMask, label: "Deepfake Videos", tone: "text-destructive" },
  { match: (c: string) => /impersonat|fake_celebrity|fake_profile/i.test(c), icon: UserX, label: "Fake Endorsements", tone: "text-orange-500" },
  { match: (c: string) => /brand/i.test(c), icon: ShieldAlert, label: "Brand Misuse", tone: "text-amber-500" },
];

function CelebrityProtection() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: a }, { data: m }] = await Promise.all([
        supabase.from("assets").select("id,title,asset_type,file_url,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
        supabase.from("discovered_matches")
          .select("id,video_title,source_url,platform,final_confidence_score,violation_category,preview_url,asset_id")
          .eq("user_id", user.id).order("final_confidence_score", { ascending: false }).limit(300),
      ]);
      setAssets(a ?? []); setMatches(m ?? []);
    })();
  }, [user]);

  const countType = (k: string) => assets.filter((a) => (a.asset_type ?? "").toLowerCase().includes(k)).length;
  const countDet = (fn: (c: string) => boolean) => matches.filter((m) => fn(m.violation_category ?? "")).length;

  return (
    <AppShell title="Celebrity Protection">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/10 text-amber-500"><Crown className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Celebrity Protection</h1>
            <p className="text-sm text-muted-foreground">Protect official likeness, voice and brand assets from unauthorized commercial usage.</p>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4">Protected Assets</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {ASSET_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.key} className="rounded-xl border border-border bg-background/50 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{t.label}</div>
                  <div className="mt-1 font-display text-2xl font-bold tabular-nums">{countType(t.key)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">Register more assets from the <Link to="/registry" className="text-primary">Assets</Link> page.</div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-medium mb-4">Detection Types</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {DETECTION.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="rounded-xl border border-border bg-background/50 p-4">
                  <div className={`flex items-center gap-2 text-xs ${d.tone}`}><Icon className="h-3.5 w-3.5" />{d.label}</div>
                  <div className="mt-1 font-display text-2xl font-bold tabular-nums">{countDet(d.match)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3 text-sm font-medium">
            <span>Highest-risk celebrity findings</span>
            <Link to="/violations" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <ul className="divide-y divide-border">
            {matches.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                {r.preview_url ? <img src={r.preview_url} alt="" className="h-12 w-20 rounded object-cover" /> : <div className="h-12 w-20 rounded bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.video_title ?? r.source_url}</div>
                  <div className="text-xs text-muted-foreground">{r.platform} · {r.violation_category ?? "—"}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  (r.final_confidence_score ?? 0) >= 70 ? "bg-destructive/10 text-destructive" :
                  (r.final_confidence_score ?? 0) >= 40 ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"
                }`}>{r.final_confidence_score ?? 0}</span>
                <div className="hidden md:flex items-center gap-1">
                  <Link to="/violations" title="Investigate" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary"><FileSearch className="h-4 w-4" /></Link>
                  <Link to="/takedown" title="Removal case" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary"><Gavel className="h-4 w-4" /></Link>
                </div>
                <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
              </li>
            ))}
            {!matches.length && <li className="p-8 text-center text-sm text-muted-foreground">No findings yet — register celebrity assets and run a Threat Scan.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
