import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Copy, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/identity")({
  head: () => ({ meta: [{ title: "Digital Identity — Eterna AI" }] }),
  component: Identity,
});

function Identity() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ platform: "Instagram", handle: "", url: "" });

  async function load() {
    const { data } = await supabase.from("identities").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("identities").insert({ user_id: user.id, ...form });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Identity added — verify ownership next"); setOpen(false); setForm({ platform: "Instagram", handle: "", url: "" }); load(); }
  }

  async function verify(id: string) {
    await supabase.from("identities").update({ status: "verified" }).eq("id", id);
    toast.success("Marked verified");
    load();
  }

  async function remove(id: string) {
    await supabase.from("identities").delete().eq("id", id); load();
  }

  return (
    <AppShell title="Digital Identity">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Digital Identity Registry</h1>
          <p className="text-sm text-muted-foreground">Link and verify your social handles, domains and channels.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Plus className="h-4 w-4" /> Add Identity
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{r.platform}</div>
                <div className="mt-1 font-display text-lg font-semibold">{r.handle}</div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block max-w-[220px]">{r.url}</a>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${r.status === "verified" ? "bg-emerald-500/10 text-emerald-700" : "bg-yellow-500/10 text-yellow-700"}`}>{r.status}</span>
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Verification token</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono break-all flex-1">eterna-verify-{r.verification_token}</code>
                <button onClick={() => { navigator.clipboard.writeText(`eterna-verify-${r.verification_token}`); toast.success("Copied"); }} className="text-muted-foreground hover:text-primary"><Copy className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {r.status !== "verified" && <button onClick={() => verify(r.id)} className="text-xs font-medium text-primary hover:underline">Mark verified</button>}
              <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-border bg-card p-12 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No identities linked</div>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-3">
            <h3 className="font-display text-lg font-semibold">Add an identity</h3>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
              {["Instagram", "YouTube", "TikTok", "X", "Facebook", "LinkedIn", "Website", "Other"].map(p => <option key={p}>{p}</option>)}
            </select>
            <input required placeholder="Handle (e.g. @arjun)" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            <input type="url" placeholder="Profile URL (optional)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-input px-4 text-sm">Cancel</button>
              <button disabled={busy} className="h-10 rounded-lg px-4 text-sm font-semibold text-primary-foreground inline-flex items-center gap-2" style={{ background: "var(--gradient-violet)" }}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
