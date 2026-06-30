import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, AlertOctagon, Trash2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/violations")({
  head: () => ({ meta: [{ title: "Violations — Eterna AI" }] }),
  component: Violations,
});

const THREAT: Record<string, string> = {
  low: "bg-yellow-500/10 text-yellow-700",
  medium: "bg-orange-500/10 text-orange-700",
  review: "bg-orange-500/10 text-orange-700",
  high: "bg-red-500/10 text-red-700",
  likely: "bg-red-500/10 text-red-700",
  critical: "bg-destructive/15 text-destructive",
  confirmed: "bg-destructive/15 text-destructive",
};

type Row = {
  id: string;
  source: "violation" | "match";
  platform: string;
  url: string;
  threat: string;
  status: string; // unified: open | in_review | enforcement_sent | resolved | dismissed
  detected_at: string;
  similarity: number | null;
  title?: string | null;
};

// Map discovered_matches.status → unified status
const matchToUnified = (s: string): string => {
  switch (s) {
    case "verified": return "in_review";
    case "escalated": return "enforcement_sent";
    case "resolved": return "resolved";
    case "dismissed":
    case "ignored": return "dismissed";
    default: return "open"; // pending, null, etc.
  }
};
const unifiedToMatch = (s: string): string => {
  switch (s) {
    case "open": return "pending";
    case "in_review": return "verified";
    case "enforcement_sent": return "escalated";
    case "resolved": return "resolved";
    case "dismissed": return "dismissed";
    default: return "pending";
  }
};

function Violations() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const [form, setForm] = useState({ platform: "Instagram", infringing_url: "", threat_level: "medium", notes: "", similarity_score: "" });

  async function load() {
    setLoading(true);
    const [vRes, mRes] = await Promise.all([
      supabase.from("violations").select("*").order("detected_at", { ascending: false }),
      supabase.from("discovered_matches").select("id,platform,source_url,video_title,risk_level,status,final_confidence_score,created_at").order("created_at", { ascending: false }),
    ]);
    const v: Row[] = (vRes.data ?? []).map((r: any) => ({
      id: r.id, source: "violation", platform: r.platform, url: r.infringing_url,
      threat: r.threat_level, status: r.status ?? "open",
      detected_at: r.detected_at, similarity: r.similarity_score,
    }));
    const m: Row[] = (mRes.data ?? []).map((r: any) => ({
      id: r.id, source: "match", platform: r.platform ?? "Web", url: r.source_url,
      threat: r.risk_level ?? "medium", status: matchToUnified(r.status ?? "pending"),
      detected_at: r.created_at, similarity: r.final_confidence_score, title: r.video_title,
    }));
    const all = [...v, ...m].sort((a, b) => +new Date(b.detected_at) - +new Date(a.detected_at));
    setRows(all);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  const filtered = useMemo(
    () => filter === "all" ? rows : rows.filter((r) => r.status === filter),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, open: 0, in_review: 0, enforcement_sent: 0, resolved: 0, dismissed: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

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
    else {
      toast.success("Violation logged"); setOpen(false);
      setForm({ platform: "Instagram", infringing_url: "", threat_level: "medium", notes: "", similarity_score: "" });
      load();
    }
  }

  async function updateStatus(row: Row, status: string) {
    const { error } = row.source === "violation"
      ? await supabase.from("violations").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id)
      : await supabase.from("discovered_matches").update({ status: unifiedToMatch(status) }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success(`Marked ${status.replace("_", " ")}`); load(); }
  }


  async function remove(row: Row) {
    if (!confirm("Delete this case?")) return;
    if (row.source === "violation") await supabase.from("violations").delete().eq("id", row.id);
    else await supabase.from("discovered_matches").delete().eq("id", row.id);
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
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>
            {f.replace("_", " ")} <span className="ml-1 opacity-70">({counts[f] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <AlertOctagon className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No violations</div>
            <div className="text-xs text-muted-foreground mt-1">Run a scan from Matching Engine or YouTube Monitor to populate this list.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Platform</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Threat</th>
                <th className="text-left p-3">Confidence</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Detected</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((v) => (
                <tr key={`${v.source}-${v.id}`} className="hover:bg-accent/30">
                  <td className="p-3 font-medium">{v.platform}</td>
                  <td className="p-3 max-w-md">
                    {v.title && <div className="text-xs text-foreground truncate">{v.title}</div>}
                    <a href={v.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1 truncate max-w-[28rem]">
                      <span className="truncate">{v.url}</span><ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${THREAT[v.threat] ?? "bg-muted text-muted-foreground"}`}>{v.threat}</span></td>
                  <td className="p-3 text-xs text-muted-foreground">{v.similarity != null ? `${Math.round(v.similarity)}%` : "—"}</td>
                  <td className="p-3">
                    <select value={v.status} onChange={(e) => updateStatus(v, e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs capitalize">
                      {filters.slice(1).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(v.detected_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right"><button onClick={() => remove(v)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
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
