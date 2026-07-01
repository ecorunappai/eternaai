import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Youtube, Loader2, ShieldAlert, Eye, EyeOff, Gavel, ExternalLink, Search, FileText, Scale, ScanFace, Tag, FolderSearch, Mail, AtSign, Globe, Instagram, Facebook, Hash, Newspaper, Rss, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { riskBadge } from "@/lib/matching";
import { runYouTubeScan, verifyYouTubeMatch } from "@/lib/youtube-matching.functions";
import { runMultiPlatformScan } from "@/lib/multi-platform-monitoring.functions";
import { createViolationFromMatch } from "@/lib/matching.functions";
import { openCaseFromMatch, investigateCase, discoverContacts } from "@/lib/browser-agent.functions";
import { browserAgentStatus } from "@/lib/browser-agent-client.functions";

export const Route = createFileRoute("/youtube")({
  head: () => ({ meta: [{ title: "Monitoring Dashboard — Eterna AI" }] }),
  component: YouTubeDash,
});

const PLATFORM_META: Record<string, { Icon: any; color: string; bg: string }> = {
  YouTube:   { Icon: Youtube,       color: "text-[#FF0000]",      bg: "bg-red-500/10 border-red-500/30" },
  Instagram: { Icon: Instagram,     color: "text-pink-600",       bg: "bg-pink-500/10 border-pink-500/30" },
  Facebook:  { Icon: Facebook,      color: "text-blue-600",       bg: "bg-blue-500/10 border-blue-500/30" },
  TikTok:    { Icon: MessageSquare, color: "text-foreground",     bg: "bg-foreground/10 border-foreground/30" },
  X:         { Icon: Hash,          color: "text-foreground",     bg: "bg-foreground/10 border-foreground/30" },
  Reddit:    { Icon: MessageSquare, color: "text-orange-600",     bg: "bg-orange-500/10 border-orange-500/30" },
  Website:   { Icon: Globe,         color: "text-primary",        bg: "bg-primary/10 border-primary/30" },
  News:      { Icon: Newspaper,     color: "text-emerald-700",    bg: "bg-emerald-500/10 border-emerald-500/30" },
  Blog:      { Icon: Rss,           color: "text-amber-700",      bg: "bg-amber-500/10 border-amber-500/30" },
};

function PlatformBadge({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.Website;
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
      <Icon className="h-3 w-3" /> {platform}
    </span>
  );
}

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
  const [platformFilter, setPlatformFilter] = useState<string>("All");
  const [scanning, setScanning] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [gatheringId, setGatheringId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, { caseId: string; emails: string[]; socials: { value: string; source_label: string }[]; title?: string; screenshot?: string }>>({});
  const scan = useServerFn(runYouTubeScan);
  const scanAll = useServerFn(runMultiPlatformScan);
  const verifyFace = useServerFn(verifyYouTubeMatch);
  const escalate = useServerFn(createViolationFromMatch);
  const openCase = useServerFn(openCaseFromMatch);
  const investigate = useServerFn(investigateCase);
  const findContacts = useServerFn(discoverContacts);
  const agentStatus = useServerFn(browserAgentStatus);
  const [agentOnline, setAgentOnline] = useState<{ online: boolean; configured: boolean; reason?: string } | null>(null);
  useEffect(() => { agentStatus().then((s) => setAgentOnline(s)).catch(() => setAgentOnline({ online: false, configured: false, reason: "probe failed" })); }, []);

  async function load() {
    const [a, m] = await Promise.all([
      supabase.from("assets").select("id,title,asset_type,storage_path").eq("asset_type", "image").order("created_at", { ascending: false }),
      supabase.from("discovered_matches").select("*")
        .in("discovered_via", ["youtube_firecrawl_ai_verified", "multi_platform_firecrawl", "multi_platform_searxng"])
        .order("created_at", { ascending: false }),
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

  // Sort: newest first, then by final confidence (risk proxy).
  const sorted = [...matches].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (tb !== ta) return tb - ta;
    return Number(b.final_confidence_score ?? 0) - Number(a.final_confidence_score ?? 0);
  });
  const visible = sorted
    .filter((m) => filter === "all" || m.asset_id === filter)
    .filter((m) => platformFilter === "All" || (m.platform ?? "Website") === platformFilter);

  // Per-platform counters across visible results.
  const counters: Record<string, number> = {};
  for (const m of visible) {
    const p = (m.platform ?? "Website") as string;
    counters[p] = (counters[p] ?? 0) + 1;
  }

  async function onScan() {
    if (!query.trim()) return toast.error("Enter a creator / brand / subject name to monitor.");
    setScanning(true);
    try {
      // Fan out: YouTube (needs reference image) + all other platforms in parallel.
      const tasks: Promise<any>[] = [scanAll({ data: { assetId: selectedAsset || null, query: query.trim() } })];
      if (selectedAsset) tasks.push(scan({ data: { assetId: selectedAsset, query: query.trim() } }));
      const results = await Promise.allSettled(tasks);
      const values = results.map((r) => r.status === "fulfilled" ? r.value : null);
      const total = values.reduce((a, v) => a + Number(v?.inserted ?? 0), 0);
      const errs = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      const source = values.find((v) => v?.source)?.source;
      const counters = values.find((v) => v?.counters)?.counters as Record<string, number> | undefined;
      const platformSummary = counters
        ? Object.entries(counters).filter(([, n]) => n > 0).map(([p, n]) => `${p}:${n}`).join(" · ")
        : "";
      if (errs.length && total === 0) {
        toast.error(String(errs[0].reason?.message ?? errs[0].reason));
      } else if (total === 0) {
        toast.message(
          `No new matches for "${query.trim()}"`,
          { description: `Searched ${source ?? "web"} across YouTube, Instagram, TikTok, Facebook, X, Reddit, News, Websites. Try a broader keyword or check back after the next scheduled scan.` },
        );
      } else {
        toast.success(`${total} suspected matches for "${query.trim()}"`, { description: platformSummary || undefined });
      }
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
      await findContacts({ data: { caseId } });
      const { data: rows } = await supabase.from("creator_contacts").select("contact_type,value,source_label").eq("case_id", caseId);
      const emails = (rows ?? []).filter(r => r.contact_type === "email").map(r => r.value);
      const socials = (rows ?? []).filter(r => r.contact_type !== "email").map(r => ({ value: r.value, source_label: r.source_label ?? "" }));
      setEvidence(prev => ({ ...prev, [matchId]: { caseId, emails, socials, title: inv.title ?? undefined, screenshot: inv.screenshot ?? undefined } }));
      toast.success(`Evidence saved · ${emails.length} email(s), ${socials.length} social link(s)`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setGatheringId(null); }
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
    <AppShell title="Monitoring Dashboard">
      {agentOnline && !agentOnline.online && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700">
          <strong>Browser Agent offline.</strong> Evidence capture and contact discovery via Playwright are unavailable.
          {agentOnline.configured ? ` (${agentOnline.reason})` : " Configure BROWSER_AGENT_URL + BROWSER_AGENT_TOKEN to enable."}
        </div>
      )}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Search className="h-6 w-6 text-primary" /> Monitoring Dashboard</h1>
        <p className="text-sm text-muted-foreground">One scan, every platform. Eterna fans out keyword + risk-suffix searches across YouTube, Instagram, Facebook, TikTok, X, Reddit, websites, news and blogs and surfaces them here in real time.</p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Run Monitoring Scan</h2>
          <span className="text-xs text-muted-foreground">Auto-expanded keywords: latest · viral · troll · reaction · expose · controversy</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Reference image (optional, enables face verify)</div>
            <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">No reference — search by name only</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Creator / brand / subject name</div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Ahaana Krishna" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </label>
          <button disabled={scanning} onClick={onScan} className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Scan All Platforms
          </button>
        </div>
      </div>

      {/* Platform counters */}
      <div className="mb-4 grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        {Object.keys(PLATFORM_META).map((p) => {
          const meta = PLATFORM_META[p]; const Icon = meta.Icon;
          const n = counters[p] ?? 0;
          return (
            <div key={p} className={`rounded-lg border p-2 ${meta.bg}`}>
              <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${meta.color}`}><Icon className="h-3 w-3" /> {p}</div>
              <div className="text-lg font-bold">{n}</div>
            </div>
          );
        })}
      </div>

      {/* Platform filter chips */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {(["All", "YouTube", "Instagram", "Facebook", "TikTok", "X", "Reddit", "News", "Website", "Blog"] as const).map((p) => {
          const count = p === "All" ? sorted.length : sorted.filter((m) => (m.platform ?? "Website") === p).length;
          const active = platformFilter === p;
          return (
            <button key={p} onClick={() => setPlatformFilter(p)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"}`}>
              {p} <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-semibold">Suspected Matches · sorted newest first</div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-sm">
          <option value="all">All assets ({matches.length})</option>
          {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>


      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {visible.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No matches yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Run a scan to surface suspected content across every platform.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m) => {
              const risk = riskBadge(m.risk_level);
              const fair = FAIR_USE_BADGE[m.fair_use_flag ?? "not_applicable"] ?? FAIR_USE_BADGE.not_applicable;
              const assetThumb = thumbs[m.asset_id];
              const platform = (m.platform ?? "Website") as string;
              const pmeta = PLATFORM_META[platform] ?? PLATFORM_META.Website;
              const PIcon = pmeta.Icon;
              const profileUrl = /PROFILE:([^|]+)/.exec(m.notes ?? "")?.[1]?.trim() || null;
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
                        {m.preview_url ? (
                          <img src={m.preview_url} alt={m.video_title} loading="lazy" className="h-24 w-40 rounded-lg object-cover border border-border bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
                        ) : (
                          <div className={`h-24 w-40 rounded-lg border flex items-center justify-center ${pmeta.bg}`}>
                            <PIcon className={`h-10 w-10 ${pmeta.color}`} />
                          </div>
                        )}
                        <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">{platform}</div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PlatformBadge platform={platform} />
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
                        {m.discovered_via === "multi_platform_searxng" && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"><Search className="h-3 w-3" />Source: SearXNG</span>
                        )}
                        <span className={`${m.discovered_via === "multi_platform_searxng" ? "" : "ml-auto"} text-xs text-muted-foreground`}>{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium line-clamp-2">{m.video_title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Channel · <span className="font-medium text-foreground">{m.channel_name}</span></div>
                      <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline break-all">
                        <ExternalLink className="h-3 w-3" />{m.source_url}
                      </a>
                      {profileUrl && (
                        <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 ml-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary hover:underline">
                          <AtSign className="h-3 w-3" /> Profile · {profileUrl.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {m.notes && <div className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1"><FileText className="h-3 w-3 mt-0.5 shrink-0" /><span className="line-clamp-2">{String(m.notes).replace(/(KEYWORD|PLATFORM|PROFILE|SOURCE):[^|]*\|\s*/g, "")}</span></div>}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <Score label="Face / Visual" v={m.clip_score} />
                        <Score label="AI Verify" v={m.ai_score} />
                        <Score label="Text Signal" v={m.metadata_score} />
                        <Score label="Final" v={m.final_confidence_score} bold />
                      </div>
                      {evidence[m.id] && (
                        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1.5">
                          <div className="font-semibold text-primary flex items-center gap-1"><FolderSearch className="h-3.5 w-3.5" /> Evidence Gathered</div>
                          {evidence[m.id].title && <div className="text-muted-foreground">Page: <span className="text-foreground">{evidence[m.id].title}</span></div>}
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Emails ({evidence[m.id].emails.length})</div>
                            {evidence[m.id].emails.length === 0 ? <div className="text-muted-foreground">None discovered publicly</div> :
                              <ul className="space-y-0.5">{evidence[m.id].emails.map(e => <li key={e} className="flex items-center gap-1"><Mail className="h-3 w-3 text-primary" /><a href={`mailto:${e}`} className="text-primary hover:underline">{e}</a></li>)}</ul>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Social / Contact links ({evidence[m.id].socials.length})</div>
                            {evidence[m.id].socials.length === 0 ? <div className="text-muted-foreground">None discovered</div> :
                              <ul className="space-y-0.5">{evidence[m.id].socials.slice(0, 8).map(s => <li key={s.value} className="flex items-center gap-1 truncate"><AtSign className="h-3 w-3 text-primary shrink-0" /><a href={s.value} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">{s.source_label || s.value}</a></li>)}</ul>}
                          </div>
                          <Link to="/browser-agent" className="inline-flex items-center gap-1 text-primary hover:underline mt-1"><ExternalLink className="h-3 w-3" /> Open in AI Browser Agent</Link>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {platform === "YouTube" && (
                        <button
                          disabled={verifyingId === m.id}
                          onClick={() => onVerifyFace(m.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                          {verifyingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanFace className="h-3 w-3" />}
                          Verify Face
                        </button>
                      )}
                      <button
                        disabled={gatheringId === m.id}
                        onClick={() => onGatherEvidence(m.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        {gatheringId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderSearch className="h-3 w-3" />}
                        Gather Evidence
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
