import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gavel, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/enforcement")({
  head: () => ({ meta: [{ title: "Enforcement — Eterna AI" }] }),
  component: Enforcement,
});

function Enforcement() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("violations").select("*, assets(title)").in("status", ["open", "in_review"]).order("detected_at", { ascending: false });
    setRows(data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function send(v: any) {
    setBusyId(v.id);
    // Simulated automated enforcement dispatch
    await new Promise(r => setTimeout(r, 900));
    await supabase.from("violations").update({ status: "enforcement_sent", updated_at: new Date().toISOString() }).eq("id", v.id);
    toast.success(`DMCA notice dispatched to ${v.platform}`);
    setBusyId(null);
    load();
  }

  return (
    <AppShell title="Enforcement">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Enforcement Queue</h1>
        <p className="text-sm text-muted-foreground">Open cases ready for automated DMCA dispatch.</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center"><Gavel className="mx-auto h-10 w-10 text-muted-foreground" /><div className="mt-3 font-medium">No pending cases</div></div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((v) => (
              <li key={v.id} className="flex items-center gap-4 p-4 hover:bg-accent/30">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{v.platform} — {v.assets?.title ?? "Unattributed asset"}</div>
                  <a href={v.infringing_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block">{v.infringing_url}</a>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${v.threat_level === "critical" ? "bg-destructive/15 text-destructive" : "bg-orange-500/10 text-orange-700"}`}>{v.threat_level}</span>
                <button onClick={() => send(v)} disabled={busyId === v.id} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
                  {busyId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Dispatch DMCA
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
