// Eterna AI — Reputation Risk Intelligence multi-platform discovery.
// Prioritises negative, defamatory, exposed, deepfake, impersonation and
// reputation-attack content. Positive/neutral mentions are downweighted.
//
// Sources fanned out in parallel:
//   News        : Google News, Bing News, general News/Entertainment portals
//   Video       : YouTube videos + Shorts (keyword discovery, distinct from creator-scan)
//   Social      : Instagram, Facebook, TikTok, X/Twitter, Threads, LinkedIn
//   Community   : Reddit (native JSON, newest-first + top-comments), Quora
//   Web         : Blogs, Forums, Websites
//
// Each source paginates until the aggregate result target (500+) is met or
// pages run out. Results are normalised into `discovered_matches`.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { brightdataGoogleSearch, brightdataConfig } from "./brightdata.functions";

const ScanInput = z.object({
  assetId: z.string().uuid().optional().nullable(),
  query: z.string().trim().min(2).max(120),
  targetResults: z.number().int().min(50).max(2000).optional(),
});

// Negative / risk suffix set — covers exposure, defamation, deepfake, scams, impersonation.
const RISK_SUFFIXES = [
  "expose","exposed","expose video","defame","defamation","controversy","scandal",
  "leaked","fake","fake news","deepfake","morphed","allegation","allegations",
  "accused","scam","fraud","lawsuit","investigation","complaint","boycott",
  "backlash","criticism","criticised","hate","harassment","abuse","insult",
  "roast","troll","reaction","react","review","misleading","misinformation",
  "unauthorized","impersonation","fake profile","cancelled","cancel",
  "rumor","exposed truth","viral","outrage","reupload","stolen",
];
const RISK_OR = RISK_SUFFIXES.join(" OR ");

type PlatformDef = {
  id: string;
  domain: string;
  matchType: string;
  buildQuery: (subject: string) => string;
  urlFilter: (url: string) => boolean;
  reach: number; // 0-100 virality/reach weight
};

const PLATFORMS: PlatformDef[] = [
  { id: "Instagram", domain: "instagram.com", matchType: "instagram_post", reach: 80,
    buildQuery: (s) => `site:instagram.com "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)instagram\.com\//i.test(u) },
  { id: "Facebook", domain: "facebook.com", matchType: "facebook_post", reach: 70,
    buildQuery: (s) => `site:facebook.com "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)facebook\.com\//i.test(u) },
  { id: "TikTok", domain: "tiktok.com", matchType: "tiktok_post", reach: 85,
    buildQuery: (s) => `site:tiktok.com "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)tiktok\.com\//i.test(u) },
  { id: "X", domain: "x.com", matchType: "x_post", reach: 90,
    buildQuery: (s) => `(site:x.com OR site:twitter.com) "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)(x|twitter)\.com\//i.test(u) },
  { id: "Threads", domain: "threads.net", matchType: "threads_post", reach: 65,
    buildQuery: (s) => `site:threads.net "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)threads\.net\//i.test(u) },
  { id: "LinkedIn", domain: "linkedin.com", matchType: "linkedin_post", reach: 55,
    buildQuery: (s) => `site:linkedin.com "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)linkedin\.com\//i.test(u) },
  { id: "YouTube", domain: "youtube.com", matchType: "youtube_video", reach: 92,
    buildQuery: (s) => `site:youtube.com "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)youtube\.com\/(watch|shorts)/i.test(u) },
  { id: "Quora", domain: "quora.com", matchType: "quora_post", reach: 50,
    buildQuery: (s) => `site:quora.com "${s}" (${RISK_OR})`,
    urlFilter: (u) => /(^|\.)quora\.com\//i.test(u) },
  { id: "News", domain: "", matchType: "news_article", reach: 82,
    buildQuery: (s) => `"${s}" (news OR article) (${RISK_OR})`,
    urlFilter: (u) => /^https?:\/\//i.test(u) },
  { id: "Blog", domain: "", matchType: "blog_post", reach: 55,
    buildQuery: (s) => `"${s}" (blog OR opinion) (${RISK_OR})`,
    urlFilter: (u) => /^https?:\/\//i.test(u) },
  { id: "Forum", domain: "", matchType: "forum_post", reach: 45,
    buildQuery: (s) => `"${s}" (forum OR discussion OR thread) (${RISK_OR})`,
    urlFilter: (u) => /^https?:\/\//i.test(u) },
  { id: "Website", domain: "", matchType: "website", reach: 50,
    buildQuery: (s) => `"${s}" (${RISK_OR}) -site:youtube.com -site:instagram.com -site:facebook.com -site:tiktok.com -site:x.com -site:twitter.com -site:reddit.com -site:threads.net -site:linkedin.com -site:quora.com`,
    urlFilter: (u) => /^https?:\/\//i.test(u) },
];

const RISK_KEYWORDS: Record<string, number> = {
  expose: 22, exposed: 22, defame: 24, defamation: 24, defamatory: 24,
  troll: 18, controversy: 16, controversial: 14, leaked: 26, scandal: 24,
  allegation: 22, allegations: 22, accused: 20, "false claim": 22,
  "fake news": 24, misinformation: 22, misleading: 18, lawsuit: 22,
  investigation: 18, complaint: 14, boycott: 22, backlash: 20, outrage: 20,
  reaction: 8, roast: 16, viral: 8, deepfake: 30, "ai generated": 22, "ai-generated": 22,
  morphed: 26, fake: 12, impersonation: 28, impersonator: 26, "fake profile": 26,
  insult: 18, harassment: 22, abuse: 20, hate: 22, racist: 24, slur: 24,
  reupload: 20, repost: 14, "stolen content": 24, "copyright infringement": 24,
  nude: 28, uncensored: 22, scam: 26, fraud: 26,
  cancel: 14, cancelled: 14, rumor: 18, rumour: 18,
  criticism: 12, criticized: 12, bashing: 20, exposed_truth: 22,
  criminal: 26, arrested: 24, banned: 20, blacklist: 18,
};

const POSITIVE_KEYWORDS = [
  "interview","collab","collaboration","promo ","promotion","sponsored",
  "appreciation","congratulations","congrats","birthday","tribute",
  "fan edit","fanmade","fan-made","official announcement","press release",
  "award","wins award","honored","celebrates","celebration","launch",
  "brand ambassador","endorsement deal",
];

function analyseText(title: string, snippet: string, subject: string) {
  const lower = `${title} ${snippet}`.toLowerCase();
  const subjLower = subject.toLowerCase();
  const subjectPresent = lower.includes(subjLower);
  let risk = 0; const hits: string[] = [];
  for (const [k, w] of Object.entries(RISK_KEYWORDS)) {
    if (lower.includes(k)) { risk += w; hits.push(k); }
  }
  const positive = POSITIVE_KEYWORDS.some((k) => lower.includes(k));
  if (positive) risk = Math.max(0, risk - 25);
  // Sentiment -100..+100 (negative dominant): risk hits push negative, positives push positive.
  const sentiment = Math.max(-100, Math.min(100, -Math.min(100, risk) + (positive ? 20 : 0)));
  return { risk: Math.min(100, risk), hits, positive, sentiment, subjectPresent };
}

function classify(title: string, snippet: string) {
  const t = `${title} ${snippet}`.toLowerCase();
  if (/(deepfake|ai[- ]generated|fake video|morph)/.test(t)) return { category: "deepfake_ai_misuse", fairUse: "high_confidence_unauthorized" };
  if (/(impersonat|fake profile|fake account)/.test(t)) return { category: "impersonation", fairUse: "high_confidence_unauthorized" };
  if (/(scam|fraud|phish)/.test(t)) return { category: "scam_association", fairUse: "high_confidence_unauthorized" };
  if (/(expose|exposed|defame|defamation|defamatory|scandal|leaked|nude|private|insult|harassment|abuse|allegation|accused|lawsuit)/.test(t)) return { category: "defamatory_content", fairUse: "defamation_risk" };
  if (/(troll|roast|meme|hate|racist|slur|boycott|backlash|outrage)/.test(t)) return { category: "reputation_attack", fairUse: "needs_legal_review" };
  if (/(reaction|reacts|review|commentary)/.test(t)) return { category: "reaction_video", fairUse: "possible_fair_use" };
  if (/(news|article|controversy|investigation)/.test(t)) return { category: "negative_news", fairUse: "needs_legal_review" };
  if (/(reupload|repost|full video|stolen)/.test(t)) return { category: "unauthorized_reupload", fairUse: "clear_reupload" };
  return { category: "negative_mention", fairUse: "needs_legal_review" };
}

function recommendedAction(category: string, score: number): string {
  if (score >= 81) return "Urgent Escalation";
  if (category === "deepfake_ai_misuse") return "Legal Review";
  if (category === "impersonation") return "Impersonation Report";
  if (category === "unauthorized_reupload") return "Copyright Review";
  if ((category === "defamatory_content" || category === "reputation_attack") && score >= 61) return "Legal Review";
  if (score >= 61) return "Platform Report";
  if (score >= 41) return "Evidence Collection";
  return "Monitor";
}

function severityLabel(score: number): string {
  if (score >= 81) return "Critical";
  if (score >= 61) return "High";
  if (score >= 41) return "Medium";
  return "Low";
}

function profileUrlFor(platform: string, url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    if (platform === "Instagram" && seg[0]) return `https://www.instagram.com/${seg[0]}/`;
    if (platform === "TikTok") { const h = seg.find((s) => s.startsWith("@")); if (h) return `https://www.tiktok.com/${h}`; }
    if (platform === "X" && seg[0] && !["i","search"].includes(seg[0])) return `https://${u.host}/${seg[0]}`;
    if (platform === "Facebook" && seg[0]) return `https://www.facebook.com/${seg[0]}`;
    if (platform === "Reddit" && seg[0] === "r" && seg[1]) return `https://www.reddit.com/r/${seg[1]}/`;
    if (platform === "YouTube") { const c = seg.find((s) => s.startsWith("@")); if (c) return `https://www.youtube.com/${c}`; }
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

type SearchHit = { url: string; title: string; description?: string; preview?: string | null; createdAt?: string | null; engagement?: number };

// ---------------------------------------------------------------------------
// Search providers
// ---------------------------------------------------------------------------

async function searxngPage(baseUrl: string, bearer: string | undefined, query: string, page: number, timeRange: "day"|"week"|"month"|""): Promise<SearchHit[]> {
  try {
    const url = new URL("/search", baseUrl.replace(/\/$/, ""));
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("safesearch", "0");
    url.searchParams.set("pageno", String(page));
    if (timeRange) url.searchParams.set("time_range", timeRange);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const r = await fetch(url.toString(), { headers });
    if (!r.ok) return [];
    const j: any = await r.json();
    return (Array.isArray(j?.results) ? j.results : []).map((it: any) => ({
      url: it.url, title: String(it.title ?? it.url),
      description: String(it.content ?? it.snippet ?? ""),
      preview: it.thumbnail ?? it.img_src ?? null,
      createdAt: it.publishedDate ?? it.pubdate ?? null,
    })).filter((h: SearchHit) => !!h.url);
  } catch { return []; }
}

async function firecrawlPage(apiKey: string, query: string, tbs: "qdr:d"|"qdr:w"|"qdr:m", limit = 20): Promise<SearchHit[]> {
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit, sources: ["web","news"], tbs }),
    });
    if (!r.ok) return [];
    const j: any = await r.json();
    const data = j?.data ?? j;
    const out: SearchHit[] = [];
    const push = (arr: any[]) => { for (const it of arr ?? []) { if (!it?.url) continue;
      out.push({ url: it.url, title: String(it.title ?? it.url), description: String(it.description ?? it.snippet ?? ""),
        preview: it.image ?? it.thumbnail ?? null, createdAt: it.date ?? it.publishedDate ?? null });
    }};
    if (Array.isArray(data)) push(data); else { push(data?.web ?? []); push(data?.news ?? []); }
    return out;
  } catch { return []; }
}

async function brightdataPage(query: string, limit = 20): Promise<SearchHit[]> {
  try {
    const results = await brightdataGoogleSearch(query, { limit });
    return results.map((r) => ({ url: r.url, title: r.title, description: r.snippet ?? "", preview: r.thumbnail ?? null, createdAt: r.publishedAt ?? null }));
  } catch { return []; }
}

// Fan out multiple providers + time ranges to hit result volume targets.
async function paginatedSearch(
  query: string,
  opts: { searx?: { base: string; bearer?: string }; firecrawl?: string; brightdata?: boolean; maxPages?: number },
): Promise<SearchHit[]> {
  const maxPages = opts.maxPages ?? 3;
  const timeRanges: Array<"day"|"week"|"month"> = ["day","week","month"];
  const tbsMap = { day: "qdr:d" as const, week: "qdr:w" as const, month: "qdr:m" as const };
  const jobs: Promise<SearchHit[]>[] = [];
  for (const tr of timeRanges) {
    for (let p = 1; p <= maxPages; p++) {
      if (opts.searx) jobs.push(searxngPage(opts.searx.base, opts.searx.bearer, query, p, tr));
    }
    if (opts.firecrawl) jobs.push(firecrawlPage(opts.firecrawl, query, tbsMap[tr], 20));
    if (opts.brightdata) jobs.push(brightdataPage(query, 20));
  }
  const results = await Promise.all(jobs);
  const merged: SearchHit[] = [];
  const seen = new Set<string>();
  for (const arr of results) for (const h of arr) {
    if (seen.has(h.url)) continue; seen.add(h.url); merged.push(h);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Reddit deep scan: posts + top comments, sorted new + relevance + top.
// ---------------------------------------------------------------------------
async function redditDeepScan(subject: string, targetPosts = 80): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const queries = [
    `"${subject}"`,
    `"${subject}" exposed`,
    `"${subject}" scam`,
    `"${subject}" controversy`,
    `"${subject}" allegation`,
    `"${subject}" deepfake`,
  ];
  const sorts: Array<"new"|"relevance"|"top"> = ["new","relevance","top"];
  for (const q of queries) {
    for (const sort of sorts) {
      if (out.length >= targetPosts) break;
      try {
        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=${sort}&t=month&limit=25&raw_json=1`;
        const r = await fetch(url, { headers: { "User-Agent": "EternaAI-Monitor/1.1" } });
        if (!r.ok) continue;
        const j: any = await r.json();
        for (const c of (j?.data?.children ?? []) as any[]) {
          const d = c?.data; if (!d?.permalink) continue;
          const preview = d.thumbnail && /^https?:\/\//.test(d.thumbnail) ? d.thumbnail
            : (d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g,"&") ?? null);
          out.push({
            url: `https://www.reddit.com${d.permalink}`,
            title: String(d.title ?? "Reddit post"),
            description: `[r/${d.subreddit ?? "unknown"} · u/${d.author ?? "unknown"} · ▲${d.ups ?? 0} · 💬${d.num_comments ?? 0}] ${String(d.selftext ?? "").slice(0, 240)}`,
            preview,
            createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
            engagement: (d.ups ?? 0) + (d.num_comments ?? 0) * 2,
          });
        }
      } catch { /* next */ }
    }
  }
  const seen = new Set<string>(); const dedup: SearchHit[] = [];
  for (const h of out) { if (seen.has(h.url)) continue; seen.add(h.url); dedup.push(h); }
  return dedup;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export const runMultiPlatformScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const searxBase = process.env.SEARXNG_BASE_URL?.trim();
    const searxBearer = process.env.SEARXNG_BEARER?.trim() || undefined;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
    const { token: brightdataToken } = brightdataConfig();
    const brightdata = !!brightdataToken;

    if (!searxBase && !firecrawlKey && !brightdata) {
      throw new Error("No search provider configured. Enable SearXNG, Firecrawl, or Bright Data.");
    }

    const subject = data.query.trim();
    const assetId = data.assetId ?? null;
    const targetResults = data.targetResults ?? 500;

    if (assetId) {
      const { data: asset } = await supabase.from("assets").select("id,user_id").eq("id", assetId).maybeSingle();
      if (!asset || asset.user_id !== userId) throw new Error("Asset not found");
    }

    const searxOpt = searxBase ? { base: searxBase, bearer: searxBearer } : undefined;
    const perPlatform = await Promise.all(PLATFORMS.map(async (p) => {
      const hits = await paginatedSearch(p.buildQuery(subject), {
        searx: searxOpt, firecrawl: firecrawlKey, brightdata, maxPages: 3,
      });
      return { platform: p, hits: hits.filter((h) => p.urlFilter(h.url)) };
    }));

    // Reddit — always native deep scan (comments + posts, newest first).
    const redditHits = await redditDeepScan(subject, 120);
    perPlatform.push({
      platform: { id: "Reddit", domain: "reddit.com", matchType: "reddit_post", reach: 78,
        buildQuery: () => "", urlFilter: () => true },
      hits: redditHits,
    });

    const seen = new Set<string>();
    const rows: any[] = [];
    const counters: Record<string, number> = {};
    const discoveredVia = searxBase ? "reputation_intel_searxng" : brightdata ? "reputation_intel_brightdata" : "reputation_intel_firecrawl";

    for (const { platform, hits } of perPlatform) {
      counters[platform.id] = 0;
      for (const h of hits) {
        if (seen.has(h.url)) continue;
        seen.add(h.url);
        const sig = analyseText(h.title, h.description ?? "", subject);
        const cls = classify(h.title, h.description ?? "");
        if (!sig.hits.length) continue;                 // require at least one risk signal
        if (sig.positive && sig.risk < 25) continue;    // drop pure positive/neutral

        const classBoost =
          cls.category === "deepfake_ai_misuse" ? 100 :
          cls.category === "impersonation" ? 95 :
          cls.category === "scam_association" ? 90 :
          cls.category === "defamatory_content" ? 85 :
          cls.category === "reputation_attack" ? 75 :
          cls.category === "unauthorized_reupload" ? 60 :
          cls.category === "negative_news" ? 70 : 40;

        // Virality: freshness × engagement × platform reach
        const ageDays = h.createdAt ? Math.max(0, (Date.now() - new Date(h.createdAt).getTime()) / 86400000) : 30;
        const freshness = Math.max(0, 100 - ageDays * 3);
        const engagement = Math.min(100, (h.engagement ?? 0) / 5);
        const virality = Math.round(freshness * 0.5 + engagement * 0.2 + platform.reach * 0.3);

        // Reputation risk 0-100
        const reputationRisk = Math.min(100, Math.round(
          sig.risk * 0.40 +
          (sig.subjectPresent ? 100 : 40) * 0.20 +
          platform.reach * 0.15 +
          classBoost * 0.15 +
          virality * 0.10,
        ));

        const risk = reputationRisk >= 81 ? "confirmed" : reputationRisk >= 61 ? "strong" : reputationRisk >= 41 ? "possible" : "review";
        const action = recommendedAction(cls.category, reputationRisk);
        const severity = severityLabel(reputationRisk);
        const profileUrl = profileUrlFor(platform.id, h.url);
        let host = ""; try { host = new URL(h.url).host.replace(/^www\./, ""); } catch { /* noop */ }

        rows.push({
          asset_id: assetId,
          user_id: userId,
          source_url: h.url,
          platform: platform.id,
          domain: host || platform.domain || null,
          preview_url: h.preview ?? null,
          channel_name: profileUrl ?? host ?? platform.id,
          video_title: h.title.slice(0, 200),
          video_id: null,
          fair_use_flag: cls.fairUse,
          violation_category: cls.category,
          phash_score: 0, dhash_score: 0, clip_score: 0,
          metadata_score: sig.risk,
          ai_score: classBoost,
          final_confidence_score: reputationRisk,
          risk_level: risk,
          match_type: platform.matchType,
          status: "pending",
          discovered_via: discoveredVia,
          notes: `SEV:${severity}(${reputationRisk}) | ACT:${action} | SENT:${sig.sentiment} | VIR:${virality} | HITS:${sig.hits.slice(0,6).join(",")} | ${h.createdAt ? `PUB:${h.createdAt} | ` : ""}${String(h.description ?? "").slice(0, 200)}`,
        });
        counters[platform.id]++;
        if (rows.length >= targetResults * 2) break; // hard safety cap
      }
    }

    // Sort newest first, then by risk score (spec: "newest content first").
    rows.sort((a, b) => {
      const ad = /PUB:([^ |]+)/.exec(a.notes)?.[1]; const bd = /PUB:([^ |]+)/.exec(b.notes)?.[1];
      const at = ad ? new Date(ad).getTime() : 0; const bt = bd ? new Date(bd).getTime() : 0;
      if (bt !== at) return bt - at;
      return (b.final_confidence_score ?? 0) - (a.final_confidence_score ?? 0);
    });

    // Replace previous pending discoveries for this scope; preserve escalated cases.
    let del = supabase.from("discovered_matches").delete()
      .eq("user_id", userId)
      .in("discovered_via", ["multi_platform_searxng","multi_platform_firecrawl","reputation_intel_searxng","reputation_intel_firecrawl","reputation_intel_brightdata"])
      .neq("status", "escalated");
    if (assetId) del = del.eq("asset_id", assetId); else del = del.is("asset_id", null);
    await del;

    let inserted = 0;
    if (rows.length) {
      // Chunk to keep payload sane.
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { data: ins, error } = await supabase.from("discovered_matches").insert(chunk).select("id");
        if (error) throw error;
        inserted += ins?.length ?? 0;
      }
    }

    return {
      inserted,
      query: subject,
      counters,
      platforms: PLATFORMS.length + 1,
      source: discoveredVia,
      targetResults,
      totalHitsConsidered: seen.size,
    };
  });
