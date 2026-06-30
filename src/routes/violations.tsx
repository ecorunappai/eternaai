import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, AlertOctagon, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/violations")({
  head: () => ({ meta: [{ title: "Violations — Eterna AI" }] }),
  component: Violations,
});

const THREAT = { low: "bg-yellow-500/10 text-yellow-700", medium: "bg-orange-500/10 text-orange-700", high: "bg-red-500/10 text-red-700", critical: "bg-destructive/15 text-destructive" };

function Violations() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const [form, setForm] = useState({ platform: "Instagram", infringing_url: "", threat_level: "medium", notes: "", similarity_score: "" });

  async function load() {
    let q = supabase.from("violations").select("*").order("detected_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setRows(data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user, filter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("violations").insert({
      user_id: user.id, platform: form.platform, infringing_url: form.infringing_url,
      threat_level: form.threat_level, notes: form.notes,
      similarity_score: form.similarity_score ? Number(form.similarity_score) : null,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Violation logged"); setOpen(false); setForm({ platform: "Instagram", infringing_url: "", threat_level: "medium", notes: "", similarity_score: "" }); load(); }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("violations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(`Marked ${status}`); load(); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this case?")) return;
    await supabase.from("violations").delete().eq("id", id);
    load();
  }

  const filters = ["all", "open", "in_review", "enforcement_sent", "resolved", "dismissed"];

  return (
    <AppShell title="Violations">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Violations</h1>
          <p className="text-sm text-muted-foreground">Track infringements, evidence and enforcement progress.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Plus className="h-4 w-4" /> Log Violation
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>{f.replace("_", " ")}</button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <AlertOctagon className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No violations</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-3">Platform</th><th className="text-left p-3">Infringing URL</th><th className="text-left p-3">Threat</th><th className="text-left p-3">Status</th><th className="text-left p-3">Detected</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((v) => (
                <tr key={v.id} className="hover:bg-accent/30">
                  <td className="p-3 font-medium">{v.platform}</td>
                  <td className="p-3 max-w-md truncate"><a href={v.infringing_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{v.infringing_url}</a></td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${THREAT[v.threat_level as keyof typeof THREAT]}`}>{v.threat_level}</span></td>
                  <td className="p-3">
                    <select value={v.status} onChange={(e) => updateStatus(v.id, e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs capitalize">
                      {filters.slice(1).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(v.detected_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right"><button onClick={() => remove(v.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-3">
            <h3 className="font-display text-lg font-semibold">Log a violation</h3>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
              {["Instagram", "YouTube", "TikTok", "X", "Facebook", "Reddit", "Web", "Marketplace"].map(p => <option key={p}>{p}</option>)}
            </select>
            <input required type="url" placeholder="https://..." value={form.infringing_url} onChange={(e) => setForm({ ...form, infringing_url: e.target.value })} className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.threat_level} onChange={(e) => setForm({ ...form, threat_level: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                {["low", "medium", "high", "critical"].map(p => <option key={p}>{p}</option>)}
              </select>
              <input type="number" min={0} max={100} placeholder="Similarity %" value={form.similarity_score} onChange={(e) => setForm({ ...form, similarity_score: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            </div>
            <textarea rows={3} placeholder="Notes / evidence" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-input bg-background p-3 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-input px-4 text-sm">Cancel</button>
              <button disabled={busy} className="h-10 rounded-lg px-4 text-sm font-semibold text-primary-foreground inline-flex items-center gap-2" style={{ background: "var(--gradient-violet)" }}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
