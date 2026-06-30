import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScanSearch, Loader2, ShieldAlert, Eye, EyeOff, Gavel, ExternalLink, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { riskBadge } from "@/lib/matching";
import { runMatchingScan, runRealMatchingScan, createViolationFromMatch } from "@/lib/matching.functions";

export const Route = createFileRoute("/matching")({
  head: () => ({ meta: [{ title: "Matching Engine — Eterna AI" }] }),
  component: Matching,
});

function Matching() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>("all");
  const [scanning, setScanning] = useState<string | null>(null);
  const scan = useServerFn(runMatchingScan);
  const realScan = useServerFn(runRealMatchingScan);
  const escalate = useServerFn(createViolationFromMatch);

  async function load() {
    const [a, m] = await Promise.all([
      supabase.from("assets").select("id,title,asset_type,phash,storage_path,file_url").order("created_at", { ascending: false }),
      supabase.from("discovered_matches").select("*").order("final_confidence_score", { ascending: false }),
    ]);
    const list = a.data ?? [];
    setAssets(list);
    setMatches(m.data ?? []);
    // Resolve signed URLs for thumbnails (images only)
    const map: Record<string, string> = {};
    await Promise.all(list.map(async (asset: any) => {
      if (asset.asset_type !== "image" || !asset.storage_path) return;
      const { data: signed } = await supabase.storage.from("assets").createSignedUrl(asset.storage_path, 3600);
      if (signed?.signedUrl) map[asset.id] = signed.signedUrl;
    }));
    setThumbs(map);
  }
  useEffect(() => { if (user) load(); }, [user]);

  const visible = matches.filter((m) => selected === "all" || m.asset_id === selected);

  async function onScan(assetId: string) {
    setScanning(assetId);
    try {
      const res = await scan({ data: { assetId } });
      toast.success(`Discovered ${res.inserted} candidate matches`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setScanning(null); }
  }

  async function onAction(matchId: string, action: "ignore" | "review" | "escalate") {
    try {
      if (action === "escalate") {
        const r = await escalate({ data: { matchId } });
        toast.success("Violation case opened" + (r.violationId ? ` (${r.violationId.slice(0, 8)})` : ""));
      } else {
        await supabase.from("discovered_matches").update({ status: action === "ignore" ? "dismissed" : "reviewing" }).eq("id", matchId);
        toast.success(action === "ignore" ? "Match dismissed" : "Marked for review");
      }
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AppShell title="Matching Engine">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold">Matching Engine</h1>
          <p className="text-sm text-muted-foreground">pHash · dHash · CLIP-style embedding · AI verification across the open web.</p>
        </div>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-sm">
          <option value="all">All assets ({matches.length})</option>
          {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Run Reverse-Image Scan</h2>
          <span className="text-xs text-muted-foreground">TinEye + fallback engines · simulated demo</span>
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Register content first to enable matching.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {thumbs[a.id] ? (
                    <img src={thumbs[a.id]} alt={a.title} className="h-12 w-12 rounded-md object-cover border border-border" />
                  ) : (
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.title}</div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {a.phash ? `pHash ${a.phash.slice(0, 12)}…` : "No fingerprint"}
                    </div>
                  </div>
                </div>
                <button
                  disabled={!a.phash || scanning === a.id}
                  onClick={() => onScan(a.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  style={{ background: "var(--gradient-violet)" }}
                >
                  {scanning === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanSearch className="h-3 w-3" />}
                  Scan
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Discovered Matches</h2>
          <span className="text-xs text-muted-foreground">{visible.length} candidates</span>
        </div>
        {visible.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No matches yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Run a scan on a registered asset to surface candidates.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m) => {
              const badge = riskBadge(m.risk_level);
              const asset = assets.find((a) => a.id === m.asset_id);
              return (
                <li key={m.id} className="p-5 hover:bg-accent/20">
                  <div className="flex items-start gap-4">
                    {thumbs[m.asset_id] ? (
                      <img src={thumbs[m.asset_id]} alt="match preview" className="h-20 w-20 shrink-0 rounded-lg object-cover border border-border" />
                    ) : (
                      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">{m.match_type?.replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground">{m.platform} · {m.domain}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-1 text-sm font-medium truncate">{asset?.title ?? "Asset"}</div>
                      <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-full">
                        <ExternalLink className="h-3 w-3" />{m.source_url}
                      </a>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                        <Score label="pHash" v={m.phash_score} />
                        <Score label="dHash" v={m.dhash_score} />
                        <Score label="CLIP" v={m.clip_score} />
                        <Score label="AI" v={m.ai_score} />
                        <Score label="Final" v={m.final_confidence_score} bold />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => onAction(m.id, "review")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                        <Eye className="h-3 w-3" /> Review
                      </button>
                      <button onClick={() => onAction(m.id, "ignore")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                        <EyeOff className="h-3 w-3" /> Ignore
                      </button>
                      <button
                        disabled={m.final_confidence_score < 60 || m.status === "escalated"}
                        onClick={() => onAction(m.id, "escalate")}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                        style={{ background: "var(--gradient-violet)" }}
                      >
                        <Gavel className="h-3 w-3" /> {m.status === "escalated" ? "Escalated" : "Enforce"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Enforcement is gated to matches above 60% confidence and always requires human approval. Every violation includes evidence URL, similarity breakdown, timestamp and links back to the asset ownership certificate.
      </p>
    </AppShell>
  );
}

function Score({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  const color = v >= 90 ? "text-destructive" : v >= 75 ? "text-orange-600" : v >= 60 ? "text-amber-600" : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${bold ? "font-bold" : "font-semibold"} ${color}`}>{Number(v).toFixed(0)}%</div>
    </div>
  );
}
