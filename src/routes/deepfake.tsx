import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { VenetianMask, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/deepfake")({
  head: () => ({ meta: [{ title: "Deepfake Detection — Eterna AI" }, { name: "description", content: "Face swaps, AI-generated videos, fake advertisements and fake endorsements." }] }),
  component: DeepfakePage,
});

function DeepfakePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("discovered_matches")
      .select("*")
      .eq("user_id", user.id)
      .or("violation_category.eq.deepfake_ai_misuse,violation_category.eq.face_image_misuse,notes.ilike.%deepfake%,notes.ilike.%ai generated%,notes.ilike.%morphed%")
      .order("final_confidence_score", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  return (
    <AppShell title="Deepfake Detection">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-destructive/10 text-destructive"><VenetianMask className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Deepfake & AI Misuse</h1>
            <p className="text-sm text-muted-foreground">Face swaps, AI-generated videos, fake advertisements, fake endorsements.</p>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["Face swaps", "AI-generated videos", "Fake advertisements", "Fake endorsements"].map((k) => (
            <div key={k} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{k}</div>
              <div className="mt-1 font-display text-2xl font-bold">
                {rows.filter((r) => new RegExp(k.split(" ")[0], "i").test(`${r.notes} ${r.violation_category}`)).length}
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">Detected deepfakes / AI misuse</div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                {r.preview_url ? <img src={r.preview_url} alt="" className="h-12 w-20 rounded object-cover" /> : <div className="h-12 w-20 rounded bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.video_title}</div>
                  <div className="text-xs text-muted-foreground">{r.platform} · {r.violation_category}</div>
                </div>
                <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold tabular-nums">{r.final_confidence_score ?? 0}</span>
                <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
              </li>
            ))}
            {!rows.length && <li className="p-8 text-center text-sm text-muted-foreground">No deepfake findings yet — run a scan targeting AI/deepfake keywords.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
