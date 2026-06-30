import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Youtube, Loader2, ShieldAlert, Eye, EyeOff, Gavel, ExternalLink, Search, Scale, ScanFace, Tag, Film, Clock, BadgeCheck, PlayCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { riskBadge } from "@/lib/matching";
import { runYouTubeScan, verifyYouTubeMatch } from "@/lib/youtube-matching.functions";
import { createViolationFromMatch } from "@/lib/matching.functions";
import { scanVideoSegments } from "@/lib/video-segments.functions";
import { classifyMatches } from "@/lib/owned-content.functions";

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

const TABS: Array<{ id: string; label: string }> = [
  { id: "latest", label: "Latest Videos" },
  { id: "new_today", label: "New Discoveries" },
  { id: "official", label: "Official Content" },
  { id: "reupload", label: "Suspected Reupload" },
  { id: "reaction", label: "Reaction" },
  { id: "troll", label: "Troll" },
  { id: "news", label: "News / Commentary" },
  { id: "fan", label: "Fan / Edit" },
  { id: "impersonation", label: "Impersonation" },
  { id: "needs_review", label: "Needs Review" },
  { id: "historical", label: "Historical (2020–2024)" },
  { id: "all", label: "All" },
];

function fmtTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function YouTubeDash() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [segmentsByMatch, setSegmentsByMatch] = useState<Record<string, any[]>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [tab, setTab] = useState<string>("latest");
  const [scanning, setScanning] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [segmentScanId, setSegmentScanId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tabsBarRef = useRef<HTMLDivElement | null>(null);

  const scan = useServerFn(runYouTubeScan);
  const verifyFace = useServerFn(verifyYouTubeMatch);
  const escalate = useServerFn(createViolationFromMatch);
  const scanSegments = useServerFn(scanVideoSegments);
  const classifyFn = useServerFn(classifyMatches);

  async function load() {
    const [a, m, segs] = await Promise.all([
      supabase.from("assets").select("id,title,asset_type,storage_path").eq("asset_type", "image").order("created_at", { ascending: false }),
      supabase.from("discovered_matches").select("*").eq("discovered_via", "youtube_firecrawl_ai_verified").order("created_at", { ascending: false }).limit(2000),
      supabase.from("video_segments").select("*").order("confidence", { ascending: false }),
    ]);
    const list = a.data ?? [];
    setAssets(list);
    setMatches(m.data ?? []);
    const segMap: Record<string, any[]> = {};
    for (const s of segs.data ?? []) (segMap[s.match_id] ||= []).push(s);
    setSegmentsByMatch(segMap);
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

  // Auto-load monitoring profile when asset changes (so user doesn't re-type the name)
  useEffect(() => {
    if (!selectedAsset) return;
    (async () => {
      const { data } = await supabase.from("monitoring_profiles").select("creator_name").eq("asset_id", selectedAsset).maybeSingle();
      if (data?.creator_name && !query) setQuery(data.creator_name);
    })();
  }, [selectedAsset]);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: matches.length, latest: matches.length };
    let newToday = 0, historical = 0;
    for (const m of matches) {
      const cat = m.is_owned ? "official" : (m.result_category ?? "needs_review");
      c[cat] = (c[cat] ?? 0) + 1;
      const created = new Date(m.created_at).getTime();
      if (created >= todayStart) newToday++;
      if (/\b20(20|21|22|23|24)\b/.test(String(m.notes ?? ""))) historical++;
    }
    c.new_today = newToday;
    c.historical = historical;
    return c;
  }, [matches, todayStart]);

  const stats = useMemo(() => {
    const channels = new Set<string>();
    let newToday = 0; let last = 0;
    for (const m of matches) {
      if (m.channel_name) channels.add(m.channel_name);
      const t = new Date(m.created_at).getTime();
      if (t >= todayStart) newToday++;
      if (t > last) last = t;
    }
    return { total: matches.length, channels: channels.size, newToday, last };
  }, [matches, todayStart]);

  const visible = useMemo(() => {
    if (tab === "all" || tab === "latest") return matches;
    if (tab === "new_today") return matches.filter(m => new Date(m.created_at).getTime() >= todayStart);
    if (tab === "historical") return matches.filter(m => /\b20(20|21|22|23|24)\b/.test(String(m.notes ?? "")));
    if (tab === "official") return matches.filter(m => m.is_owned || m.result_category === "official");
    return matches.filter(m => !m.is_owned && (m.result_category ?? "needs_review") === tab);
  }, [matches, tab, todayStart]);

  const [liveJob, setLiveJob] = useState<any>(null);

  // Poll active scan_job for progress
  useEffect(() => {
    if (!liveJob?.id) return;
    const status = liveJob.status;
    if (status === "completed" || status === "completed_empty" || status === "failed") return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("scan_jobs").select("*").eq("id", liveJob.id).maybeSingle();
      if (data) setLiveJob(data);
    }, 1500);
    return () => clearInterval(t);
  }, [liveJob?.id, liveJob?.status]);

  async function onScan() {
    if (!selectedAsset) return toast.error("Select a registered face/reference image first.");
    if (!query.trim()) return toast.error("Enter a creator / celebrity name to discover videos.");
    setScanning(true);
    // Pre-create a placeholder live job for instant UI feedback; the real one updates from server returns.
    setLiveJob({ id: null, status: "running", progress: 0, passes_done: 0, total_passes: 0, current_pass: "starting", candidates_found: 0 });
    // Resolve the actual job row once it appears (server creates it ~immediately)
    const poller = setInterval(async () => {
      const { data } = await supabase.from("scan_jobs").select("*").eq("asset_id", selectedAsset).eq("kind", "youtube").order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (data && (!liveJob?.id || data.id !== liveJob?.id) && data.status === "running") {
        setLiveJob(data); clearInterval(poller);
      }
    }, 800);
    try {
      const r: any = await scan({ data: { assetId: selectedAsset, query: query.trim() } });
      clearInterval(poller);
      if (r.job_id) {
        const { data } = await supabase.from("scan_jobs").select("*").eq("id", r.job_id).maybeSingle();
        setLiveJob(data);
      }
      if ((r.inserted ?? 0) === 0 && (r.candidates_found ?? 0) === 0) {
        toast.message(r.note ?? "No matches");
      } else {
        toast.success(`+${r.new_count ?? r.inserted} new · ${r.duplicates_skipped ?? 0} duplicates skipped · ${r.passes_run ?? 0} discovery passes · total ${r.total ?? r.inserted}.`);
        await classifyFn({ data: { subject: query.trim() } });
      }
      load();
    } catch (e) {
      clearInterval(poller);
      setLiveJob((j: any) => j ? { ...j, status: "failed", error_message: (e as Error).message } : null);
      toast.error((e as Error).message);
    }
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

  async function onScanSegments(matchId: string) {
    setSegmentScanId(matchId);
    try {
      const r: any = await scanSegments({ data: { matchId, mode: "storyboard", deepPass: true } });
      if (r.engine === "metadata_thumbnail") {
        if (r.segments > 0) {
          toast.success(`Storyboard unavailable — fallback verified subject in thumbnail (${r.top_confidence}%).`);
        } else {
          toast.message("Storyboard unavailable. Fallback scan ran on metadata + thumbnail but found no visual match.");
        }
      } else {
        toast.success(`${r.segments} matched segment(s) found · ${r.frames_matched} frame hits across ${r.sprites_scanned}/${r.total_sprites} sprites · top ${r.top_confidence}%`);
      }
      setExpanded(s => ({ ...s, [matchId]: true }));
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSegmentScanId(null); }
  }

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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Youtube className="h-6 w-6 text-[#FF0000]" /> YouTube Monitoring</h1>
          <p className="text-sm text-muted-foreground">Multi-keyword Firecrawl discovery · official-content layer · video segment detection (storyboard) · face verification on demand.</p>
        </div>
        <button onClick={async () => { await classifyFn({ data: {} }); toast.success("Re-classified"); load(); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-accent">
          <RefreshCw className="h-3.5 w-3.5" /> Re-classify
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Videos Found" value={stats.total.toLocaleString()} />
        <StatCard label="Channels Found" value={stats.channels.toLocaleString()} />
        <StatCard label="New Today" value={stats.newToday.toLocaleString()} accent />
        <StatCard label="Last Scan" value={stats.last ? new Date(stats.last).toLocaleString() : "—"} />
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Run YouTube Scan</h2>
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
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Creator / celebrity name</div>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Ahaana Krishna" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </label>
            <button disabled={scanning || !selectedAsset} onClick={onScan} className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />} Scan YouTube
            </button>
          </div>
        )}
        {liveJob && (
          <div className="mt-4 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {liveJob.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : liveJob.status === "failed" ? <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> : <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                <span className="font-semibold capitalize">{String(liveJob.status).replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">· pass: {liveJob.current_pass ?? "—"}</span>
                <span className="text-muted-foreground">· {liveJob.passes_done ?? 0}/{liveJob.total_passes ?? 0} passes</span>
                <span className="text-muted-foreground">· {liveJob.candidates_found ?? 0} candidates</span>
                {liveJob.new_count != null && liveJob.status !== "running" && <span className="text-emerald-600 font-semibold">+{liveJob.new_count} new</span>}
              </div>
              <button onClick={() => setLiveJob(null)} className="text-muted-foreground hover:text-foreground">Dismiss</button>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${liveJob.progress ?? 0}%`, background: "var(--gradient-violet)" }} />
            </div>
            {liveJob.error_message && <div className="mt-2 text-[11px] text-destructive">{liveJob.error_message}</div>}
          </div>
        )}
      </div>

      <div ref={tabsBarRef} className="mb-4 flex flex-wrap gap-1.5 border-b border-border scroll-mt-20">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              requestAnimationFrame(() => tabsBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label} <span className="ml-1 text-[10px] text-muted-foreground">({counts[t.id] ?? 0})</span>
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{visible.length.toLocaleString()}</span> result{visible.length === 1 ? "" : "s"} in <span className="font-semibold text-foreground">{TABS.find(t => t.id === tab)?.label}</span>
        </div>
        {tab === "news" && (
          <button
            onClick={onScan}
            disabled={scanning || !selectedAsset || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            title="Force a fresh YouTube fetch for news / commentary"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh results
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {visible.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">Nothing in this tab</div>
            <p className="mt-1 text-sm text-muted-foreground">{tab === "official" ? "No matches resolved to an owned account. Register the creator's official channel in Official Content." : "Run a scan or switch tabs."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m) => {
              const risk = riskBadge(m.risk_level);
              const fair = FAIR_USE_BADGE[m.fair_use_flag ?? "not_applicable"] ?? FAIR_USE_BADGE.not_applicable;
              const assetThumb = thumbs[m.asset_id];
              const isOwned = !!m.is_owned || m.result_category === "official";
              const segs = segmentsByMatch[m.id] ?? [];
              return (
                <li key={m.id} className={`p-5 hover:bg-accent/20 ${isOwned ? "bg-emerald-500/[0.03]" : ""}`}>
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
                        {isOwned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold"><BadgeCheck className="h-3 w-3" /> Owned · Safe</span>
                        ) : (
                          <>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${risk.className}`}>{risk.label}</span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${fair.className}`}><Scale className="h-3 w-3" />{fair.label}</span>
                          </>
                        )}
                        {m.result_category && m.result_category !== "unknown" && !isOwned && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">{String(m.result_category).replace(/_/g, " ")}</span>
                        )}
                        {(() => {
                          const kw = /KEYWORD:([^|]+)/.exec(m.notes ?? "")?.[1]?.trim();
                          return kw ? <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-foreground"><Tag className="h-3 w-3" />{kw}</span> : null;
                        })()}
                        {!isOwned && Number(m.ai_score ?? 0) === 0 && (
                          <span className="rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">Needs Visual Review</span>
                        )}
                        {segs.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-2 py-0.5 text-[10px] font-semibold"><Film className="h-3 w-3" /> {segs.length} matched segment{segs.length === 1 ? "" : "s"}</span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium line-clamp-2">{m.video_title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Channel · <span className="font-medium text-foreground">{m.channel_name}</span></div>
                      <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />{m.source_url}
                      </a>
                      {!isOwned && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <Score label="Face / Visual" v={m.clip_score} />
                          <Score label="AI Verify" v={m.ai_score} />
                          <Score label="Text Signal" v={m.metadata_score} />
                          <Score label="Final" v={m.final_confidence_score} bold />
                        </div>
                      )}

                      {segs.length > 0 && (
                        <div className="mt-3">
                          <button onClick={() => setExpanded(s => ({ ...s, [m.id]: !s[m.id] }))} className="text-xs font-semibold text-primary hover:underline">
                            {expanded[m.id] ? "Hide" : "Show"} matched segments
                          </button>
                          {expanded[m.id] && (
                            <ul className="mt-2 space-y-2">
                              {segs.map((s) => (
                                <li key={s.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-2.5">
                                  {s.frame_screenshot_url && <img src={s.frame_screenshot_url} alt="frame" className="h-16 w-28 rounded object-cover border border-border" />}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-xs">
                                      <Clock className="h-3 w-3 text-primary" />
                                      <span className="font-mono font-semibold">{fmtTime(s.start_seconds)} – {fmtTime(s.end_seconds)}</span>
                                      <span className="rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-2 py-0.5 text-[9px] font-semibold">{Number(s.confidence).toFixed(0)}% · {s.match_type?.replace(/_/g, " ")}</span>
                                      <span className="text-[10px] text-muted-foreground">{s.frame_count} frame{s.frame_count === 1 ? "" : "s"} · {s.detection_method}</span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      <a href={s.deep_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10">
                                        <PlayCircle className="h-3 w-3" /> Open at {fmtTime(s.start_seconds)}
                                      </a>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                    {!isOwned && (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button disabled={verifyingId === m.id} onClick={() => onVerifyFace(m.id)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                          {verifyingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanFace className="h-3 w-3" />} Verify Face
                        </button>
                        <button disabled={segmentScanId === m.id} onClick={() => onScanSegments(m.id)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                          {segmentScanId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />} Scan Segments
                        </button>
                        <button onClick={() => onAction(m.id, "review")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                          <Eye className="h-3 w-3" /> Review
                        </button>
                        <button onClick={() => onAction(m.id, "ignore")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                          <EyeOff className="h-3 w-3" /> Ignore
                        </button>
                        <button disabled={m.status === "escalated"} onClick={() => onAction(m.id, "escalate")} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
                          <Gavel className="h-3 w-3" /> {m.status === "escalated" ? "In Review" : "Create Case"}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Segment detection samples YouTube's public storyboard sprites and uses Gemini multimodal to locate cells containing the registered reference, then groups consecutive frames into timestamped segments. For full per-second video frame analysis, configure an external ffmpeg worker via <code>EXTERNAL_VIDEO_WORKER_URL</code>. All enforcement still requires human review.
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

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"} p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

