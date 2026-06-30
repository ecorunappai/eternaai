import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Youtube, Loader2, ShieldAlert, Eye, EyeOff, Gavel, ExternalLink, Search, FileText, Scale, ScanFace, Tag, FolderSearch, Mail, AtSign } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { riskBadge } from "@/lib/matching";
import { runYouTubeScan, verifyYouTubeMatch } from "@/lib/youtube-matching.functions";
import { createViolationFromMatch } from "@/lib/matching.functions";
import { openCaseFromMatch, investigateCase, discoverContacts } from "@/lib/browser-agent.functions";

export const Route = createFileRoute("/youtube")({
  head: () => ({ meta: [{ title: "YouTube Monitoring — Eterna AI" }] }),
  component: YouTubeDash,
});

const FAIR_USE_BADGE: Record<string, { label: string; className: string }> = {
  high_confidence_unauthorized: { label: "Unauthorized Use", className: "bg-destructive/10 text-destructive border-destructive/30" },
  clear_reupload: { label: "Clear Reupload", className: "bg-destructive/10 text-destructive border-destructive/30" },
  impersonation_fake_profile: { label: "Impersonation", className: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  defamation_risk: { label: "Defamation Risk", className: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  possible_fair_use: { label: "Possible Fair Use", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  needs_legal_review: { label: "Needs Legal Review", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  not_applicable: { label: "—", className: "bg-muted text-muted-foreground border-border" },
};

function YouTubeDash() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [filter, setFilter] = useState<string>("all");
  const [scanning, setScanning] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [gatheringId, setGatheringId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, { caseId: string; emails: string[]; socials: { value: string; source_label: string }[]; title?: string; screenshot?: string }>>({});
  const scan = useServerFn(runYouTubeScan);
  const verifyFace = useServerFn(verifyYouTubeMatch);
  const escalate = useServerFn(createViolationFromMatch);
  const openCase = useServerFn(openCaseFromMatch);
  const investigate = useServerFn(investigateCase);
  const findContacts = useServerFn(discoverContacts);

  async function load() {
    const [a, m] = await Promise.all([
      supabase.from("assets").select("id,title,asset_type,storage_path").eq("asset_type", "image").order("created_at", { ascending: false }),
      supabase.from("discovered_matches").select("*").eq("discovered_via", "youtube_firecrawl_ai_verified").order("final_confidence_score", { ascending: false }),
    ]);
    const list = a.data ?? [];
    setAssets(list);
    setMatches(m.data ?? []);
    if (!selectedAsset && list[0]) setSelectedAsset(list[0].id);
    const map: Record<string, string> = {};
    await Promise.all(list.map(async (asset: any) => {
      if (!asset.storage_path) return;
      const { data: signed } = await supabase.storage.from("assets").createSignedUrl(asset.storage_path, 3600);
      if (signed?.signedUrl) map[asset.id] = signed.signedUrl;
    }));
    setThumbs(map);
  }
  useEffect(() => { if (user) load(); }, [user]);

  const visible = matches.filter((m) => filter === "all" || m.asset_id === filter);

  async function onScan() {
    if (!selectedAsset) return toast.error("Select a registered face/reference image first.");
    if (!query.trim()) return toast.error("Enter a creator / celebrity name to discover videos.");
    setScanning(true);
    try {
      const r = await scan({ data: { assetId: selectedAsset, query: query.trim() } });
      if (r.inserted === 0) toast.message((r as any).note ?? "No matches");
      else toast.success(`${r.inserted} suspected videos across ${(r as any).variants ?? 0} keyword variants for "${(r as any).query}"`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setScanning(false); }
  }

  async function onVerifyFace(matchId: string) {
    setVerifyingId(matchId);
    try {
      const r = await verifyFace({ data: { matchId } });
      toast.success(`${r.verified ? "Face MATCH" : "No face match"} · visual ${r.visual}% · final ${r.final}%`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setVerifyingId(null); }
  }

  async function onGatherEvidence(matchId: string) {
    setGatheringId(matchId);
    try {
      const { caseId } = await openCase({ data: { matchId } });
      const inv = await investigate({ data: { caseId } });
      const contacts = await findContacts({ data: { caseId } });
      // fetch contact details
      const { data: rows } = await supabase.from("creator_contacts").select("contact_type,value,source_label").eq("case_id", caseId);
      const emails = (rows ?? []).filter(r => r.contact_type === "email").map(r => r.value);
      const socials = (rows ?? []).filter(r => r.contact_type !== "email").map(r => ({ value: r.value, source_label: r.source_label }));
      setEvidence(prev => ({ ...prev, [matchId]: { caseId, emails, socials, title: inv.title ?? undefined, screenshot: inv.screenshot ?? undefined } }));
      toast.success(`Evidence saved · ${emails.length} email(s), ${socials.length} social link(s)`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setGatheringId(null); }

  async function onAction(matchId: string, action: "ignore" | "review" | "escalate") {
    try {
      if (action === "escalate") {
        const r = await escalate({ data: { matchId } });
        toast.success("Sent to human reviewer" + (r.violationId ? ` (${r.violationId.slice(0, 8)})` : ""));
      } else {
        await supabase.from("discovered_matches").update({ status: action === "ignore" ? "dismissed" : "reviewing" }).eq("id", matchId);
        toast.success(action === "ignore" ? "Dismissed" : "Sent to manual review");
      }
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AppShell title="YouTube Monitoring">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Youtube className="h-6 w-6 text-[#FF0000]" /> YouTube Monitoring</h1>
        <p className="text-sm text-muted-foreground">Detect unauthorized use of your face, photos, or video content across YouTube videos, Shorts, reaction videos and compilations — with fair-use classification.</p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Run YouTube Scan</h2>
          <span className="text-xs text-muted-foreground">Multi-keyword Firecrawl discovery · English + Malayalam/Tamil/Hindi · face verification on demand</span>
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Register a reference image (face / celebrity photo) in Content Registry first.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Reference image</div>
              <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Search query (creator / celebrity name)</div>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Ahaana Krishna" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </label>
            <button disabled={scanning || !selectedAsset} onClick={onScan} className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
              Scan YouTube
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-semibold">Suspected YouTube Matches</div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-sm">
          <option value="all">All assets ({matches.length})</option>
          {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {visible.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No YouTube matches yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Run a scan to surface suspected videos.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m) => {
              const risk = riskBadge(m.risk_level);
              const fair = FAIR_USE_BADGE[m.fair_use_flag ?? "not_applicable"] ?? FAIR_USE_BADGE.not_applicable;
              const assetThumb = thumbs[m.asset_id];
              return (
                <li key={m.id} className="p-5 hover:bg-accent/20">
                  <div className="flex items-start gap-4">
                    <div className="flex gap-2 shrink-0">
                      {assetThumb ? (
                        <div className="text-center">
                          <img src={assetThumb} alt="reference" className="h-24 w-24 rounded-lg object-cover border border-border" />
                          <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">Reference</div>
                        </div>
                      ) : null}
                      <div className="text-center">
                        <img src={m.preview_url} alt={m.video_title} loading="lazy" className="h-24 w-40 rounded-lg object-cover border border-border bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
                        <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">{m.match_type === "youtube_short" ? "Short" : "Video"}</div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${risk.className}`}>{risk.label}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${fair.className}`}><Scale className="h-3 w-3" />{fair.label}</span>
                        {m.violation_category && m.violation_category !== "unrelated" && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">{String(m.violation_category).replace(/_/g, " ")}</span>
                        )}
                        {(() => {
                          const kw = /KEYWORD:([^|]+)/.exec(m.notes ?? "")?.[1]?.trim();
                          return kw ? <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-foreground"><Tag className="h-3 w-3" />{kw}</span> : null;
                        })()}
                        {Number(m.ai_score ?? 0) === 0 && (
                          <span className="rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">Needs Visual Review</span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium line-clamp-2">{m.video_title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Channel · <span className="font-medium text-foreground">{m.channel_name}</span></div>
                      <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />{m.source_url}
                      </a>
                      {m.notes && <div className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1"><FileText className="h-3 w-3 mt-0.5 shrink-0" /><span className="line-clamp-2">{String(m.notes).replace(/KEYWORD:[^|]+\|\s*/, "")}</span></div>}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <Score label="Face / Visual" v={m.clip_score} />
                        <Score label="AI Verify" v={m.ai_score} />
                        <Score label="Text Signal" v={m.metadata_score} />
                        <Score label="Final" v={m.final_confidence_score} bold />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        disabled={verifyingId === m.id}
                        onClick={() => onVerifyFace(m.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        {verifyingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanFace className="h-3 w-3" />}
                        Verify Face
                      </button>
                      <button onClick={() => onAction(m.id, "review")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                        <Eye className="h-3 w-3" /> Review
                      </button>
                      <button onClick={() => onAction(m.id, "ignore")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                        <EyeOff className="h-3 w-3" /> Ignore
                      </button>
                      <button
                        disabled={m.status === "escalated"}
                        onClick={() => onAction(m.id, "escalate")}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                        style={{ background: "var(--gradient-violet)" }}
                      >
                        <Gavel className="h-3 w-3" /> {m.status === "escalated" ? "In Review" : "Create Case"}
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
        Enforcement actions (DMCA, impersonation report, defamation report) are never submitted automatically — every case requires user, Eterna manager, and (for high-profile or fair-use ambiguous cases) legal reviewer approval.
      </p>
    </AppShell>
  );
}

function Score({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  const n = Number(v ?? 0);
  const color = n >= 90 ? "text-destructive" : n >= 75 ? "text-orange-600" : n >= 60 ? "text-amber-600" : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${bold ? "font-bold" : "font-semibold"} ${color}`}>{n.toFixed(0)}%</div>
    </div>
  );
}
