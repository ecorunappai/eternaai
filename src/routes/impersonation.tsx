import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { UserX, ExternalLink, Instagram, Facebook, Linkedin, Globe } from "lucide-react";

export const Route = createFileRoute("/impersonation")({
  head: () => ({ meta: [{ title: "Impersonation Detection — Eterna AI" }, { name: "description", content: "Fake Instagram, Facebook, LinkedIn accounts and impersonation websites." }] }),
  component: ImpersonationPage,
});

const CATS = [
  { id: "Instagram", icon: Instagram, label: "Fake Instagram" },
  { id: "Facebook", icon: Facebook, label: "Fake Facebook" },
  { id: "LinkedIn", icon: Linkedin, label: "Fake LinkedIn" },
  { id: "Website", icon: Globe, label: "Fake Websites" },
];

function ImpersonationPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("discovered_matches")
      .select("*")
      .eq("user_id", user.id)
      .or("violation_category.ilike.%impersonat%,violation_category.eq.fake_celebrity_claim,violation_category.eq.identity_impersonation,notes.ilike.%impersonat%,notes.ilike.%fake profile%")
      .order("final_confidence_score", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  return (
    <AppShell title="Impersonation Detection">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-destructive/10 text-destructive"><UserX className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Impersonation & Fake Profiles</h1>
            <p className="text-sm text-muted-foreground">Fake accounts and impersonation sites using your name, face or brand.</p>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATS.map((c) => {
            const Icon = c.icon;
            const list = rows.filter((r) => r.platform === c.id);
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{c.label}</div>
                <div className="mt-1 font-display text-2xl font-bold">{list.length}</div>
              </div>
            );
          })}
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">Suspected impersonators</div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                {r.preview_url ? <img src={r.preview_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="h-12 w-12 rounded-full bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.channel_name ?? r.video_title}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.platform} · {r.source_url}</div>
                </div>
                <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold tabular-nums">{r.final_confidence_score ?? 0}</span>
                <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
              </li>
            ))}
            {!rows.length && <li className="p-8 text-center text-sm text-muted-foreground">No impersonation findings yet.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
