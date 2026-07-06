// Eterna AI — multi-platform monitoring discovery.
// One scan = parallel Firecrawl searches across Instagram, Facebook, TikTok, X,
// Reddit, websites, news, blogs (YouTube handled by youtube-matching).
// Results are normalised into the existing `discovered_matches` table so the
// monitoring dashboard, violations and case-flow keep working unchanged.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ScanInput = z.object({
  assetId: z.string().uuid().optional().nullable(),
  query: z.string().trim().min(2).max(120),
});

// Suffix set requested by Eterna ops — covers exposure, defamation and impersonation vectors.
const SUFFIXES = [
  "", "latest", "viral", "troll", "reaction", "expose", "exposed", "defame",
  "defamation", "defamatory", "controversy", "scandal", "leaked", "fake",
  "deepfake", "morphed", "roast", "insult", "harassment", "abuse",
];

const RISK_QUERY = SUFFIXES.filter(Boolean).join(" OR ");

type PlatformDef = {
  id: string;            // canonical platform label stored in DB
  label: string;
  domain: string;        // primary domain (for `domain` column)
  // Build the Firecrawl search query for this platform.
  buildQuery: (subject: string) => string;
  // Restrict accepted result URLs.
  urlFilter: (url: string) => boolean;
  matchType: string;
};

const PLATFORMS: PlatformDef[] = [
  {
    id: "Instagram", label: "Instagram", domain: "instagram.com", matchType: "instagram_post",
    buildQuery: (s) => `site:instagram.com "${s}" (${RISK_QUERY})`,
    urlFilter: (u) => /(^|\.)instagram\.com\//i.test(u),
  },
  {
    id: "Facebook", label: "Facebook", domain: "facebook.com", matchType: "facebook_post",
    buildQuery: (s) => `site:facebook.com "${s}" (${RISK_QUERY})`,
    urlFilter: (u) => /(^|\.)facebook\.com\//i.test(u),
  },
  {
    id: "TikTok", label: "TikTok", domain: "tiktok.com", matchType: "tiktok_post",
    buildQuery: (s) => `site:tiktok.com "${s}" (${RISK_QUERY})`,
    urlFilter: (u) => /(^|\.)tiktok\.com\//i.test(u),
  },
  {
    id: "X", label: "X / Twitter", domain: "x.com", matchType: "x_post",
    buildQuery: (s) => `(site:x.com OR site:twitter.com) "${s}" (${RISK_QUERY})`,
    urlFilter: (u) => /(^|\.)(x|twitter)\.com\//i.test(u),
  },
  {
    id: "Reddit", label: "Reddit", domain: "reddit.com", matchType: "reddit_post",
    buildQuery: (s) => `site:reddit.com "${s}" (${RISK_QUERY})`,
    urlFilter: (u) => /(^|\.)reddit\.com\//i.test(u),
  },
  {
    id: "Website", label: "Website", domain: "", matchType: "website",
    buildQuery: (s) => `"${s}" (${RISK_QUERY}) -site:youtube.com -site:instagram.com -site:facebook.com -site:tiktok.com -site:x.com -site:twitter.com -site:reddit.com`,
    urlFilter: (u) => /^https?:\/\//i.test(u),
  },
  {
    id: "News", label: "News", domain: "", matchType: "news_article",
    buildQuery: (s) => `"${s}" news (${RISK_QUERY})`,
    urlFilter: (u) => /^https?:\/\//i.test(u),
  },
  {
    id: "Blog", label: "Blog", domain: "", matchType: "blog_post",
    buildQuery: (s) => `"${s}" blog (${RISK_QUERY})`,
    urlFilter: (u) => /^https?:\/\//i.test(u),
  },
];

const RISK_KEYWORDS: Record<string, number> = {
  expose: 22, exposed: 22, defame: 24, defamation: 24, defamatory: 24,
  troll: 18, controversy: 16, controversial: 14, leaked: 24, scandal: 22,
  allegation: 22, allegations: 22, accused: 20, "false claim": 22,
  "fake news": 22, misinformation: 22, misleading: 18,
  reaction: 8, roast: 16, viral: 8, deepfake: 28, "ai generated": 22, "ai-generated": 22,
  morphed: 26, fake: 12, impersonation: 26, impersonator: 26, "fake profile": 26,
  insult: 18, harassment: 22, abuse: 20, hate: 22, racist: 24, slur: 24,
  reupload: 20, repost: 14, "stolen content": 24, "copyright infringement": 24,
  nude: 28, uncensored: 22, scam: 24, fraud: 24, boycott: 22,
  cancel: 14, cancelled: 14, rumor: 18, rumour: 18,
  criticism: 12, criticized: 12, bashing: 20, backlash: 20, outrage: 20,
};

// Positive / neutral signals — presence downweights and (if no risk hit) excludes the item.
const POSITIVE_KEYWORDS = [
  "interview", "collab", "collaboration", "promo ", "promotion", "sponsored",
  "appreciation", "congratulations", "congrats", "birthday wishes", "tribute",
  "fan edit", "fanmade", "fan-made", "official announcement", "press release",
  "award", "wins award", "honored", "celebrates", "celebration",
  "brand ambassador", "endorsement",
];

function scoreText(title: string, snippet: string, subject: string): { score: number; risky: boolean; positive: boolean; hits: string[] } {
  const lower = `${title} ${snippet}`.toLowerCase();
  const subjLower = subject.toLowerCase();
  let s = 0;
  const hits: string[] = [];
  if (lower.includes(subjLower)) s += 20;
  for (const [k, w] of Object.entries(RISK_KEYWORDS)) {
    if (lower.includes(k)) { s += w; hits.push(k); }
  }
  const positive = POSITIVE_KEYWORDS.some((k) => lower.includes(k));
  if (positive) s = Math.max(0, s - 25);
  return { score: Math.min(100, s), risky: hits.length > 0, positive, hits };
}

function recommendedAction(category: string, score: number): string {
  if (score >= 81) return "Urgent Escalation";
  if (category === "deepfake_ai_misuse") return "Legal Review";
  if (/impersonat/.test(category)) return "Impersonation Report";
  if (category === "unauthorized_reupload" || category === "copyright_infringement") return "Copyright Review";
  if (category === "defamatory_content" && score >= 61) return "Legal Review";
  if (score >= 61) return "Platform Report";
  if (score >= 41) return "Evidence Collection";
  return "Monitor";
}

function severityLabel(score: number): string {
  if (score >= 81) return "Critical";
  if (score >= 61) return "High";
  if (score >= 41) return "Moderate";
  if (score >= 21) return "Low";
  return "Minimal";
}

function classify(title: string, snippet: string): { category: string; fairUse: string } {
  const t = `${title} ${snippet}`.toLowerCase();
  if (/(deepfake|ai[- ]generated|fake video)/.test(t)) return { category: "deepfake_ai_misuse", fairUse: "high_confidence_unauthorized" };
  if (/(expose|exposed|defame|defamation|defamatory|scandal|leaked|nude|private|insult|harassment|abuse)/.test(t)) return { category: "defamatory_content", fairUse: "defamation_risk" };
  if (/(troll|roast|meme)/.test(t)) return { category: "defamatory_content", fairUse: "needs_legal_review" };
  if (/(reaction|reacts|review|commentary)/.test(t)) return { category: "reaction_video", fairUse: "possible_fair_use" };
  if (/(news|article|controversy)/.test(t)) return { category: "defamatory_content", fairUse: "needs_legal_review" };
  if (/(reupload|repost|full video)/.test(t)) return { category: "unauthorized_reupload", fairUse: "clear_reupload" };
  return { category: "thumbnail_misuse", fairUse: "needs_legal_review" };
}

function profileUrlFor(platform: string, url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    if (platform === "Instagram" && seg[0]) return `https://www.instagram.com/${seg[0]}/`;
    if (platform === "TikTok") {
      const handle = seg.find((s) => s.startsWith("@"));
      if (handle) return `https://www.tiktok.com/${handle}`;
    }
    if (platform === "X") {
      if (seg[0] && !["i", "search"].includes(seg[0])) return `https://${u.host}/${seg[0]}`;
    }
    if (platform === "Facebook" && seg[0]) return `https://www.facebook.com/${seg[0]}`;
    if (platform === "Reddit" && seg[0] === "r" && seg[1]) return `https://www.reddit.com/r/${seg[1]}/`;
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

type SearchHit = { url: string; title: string; description?: string; preview?: string | null; createdAt?: string | null; engine?: string };

async function readFirecrawlError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  if (response.status === 402) {
    return "Firecrawl credits are exhausted or billing is inactive. Top up/upgrade Firecrawl, then reconnect the Firecrawl connector and run the scan again.";
  }
  if (response.status === 401 || response.status === 403) {
    return "Firecrawl rejected the API key. Reconnect the Firecrawl connector with the latest key, then run the scan again.";
  }
  return `Firecrawl search failed (${response.status}): ${body.slice(0, 300) || response.statusText}`;
}

// SearXNG (self-hosted) — primary discovery source. See /services/README.md.
async function searxngSearch(baseUrl: string, bearer: string | undefined, query: string, limit = 10, timeRange: "month" | "" = "month"): Promise<SearchHit[]> {
  try {
    const url = new URL("/search", baseUrl.replace(/\/$/, ""));
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("safesearch", "0");
    if (timeRange) url.searchParams.set("time_range", timeRange);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const r = await fetch(url.toString(), { headers });
    if (!r.ok) return [];
    const j: any = await r.json();
    const arr: any[] = Array.isArray(j?.results) ? j.results : [];
    return arr.slice(0, limit).map((it) => ({
      url: it.url,
      title: String(it.title ?? it.url),
      description: String(it.content ?? it.snippet ?? ""),
      preview: it.thumbnail ?? it.img_src ?? null,
      createdAt: it.publishedDate ?? it.pubdate ?? null,
      engine: it.engine,
    })).filter((h) => !!h.url);
  } catch { return []; }
}

async function firecrawlSearch(apiKey: string, query: string, limit = 10): Promise<SearchHit[]> {
  const r = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    // tbs: qdr:m -> Google "past month" filter for fresher results.
    body: JSON.stringify({ query, limit, sources: ["web", "news"], tbs: "qdr:m" }),
  });
  if (!r.ok) throw new Error(await readFirecrawlError(r));
  const j: any = await r.json();
  const data = j?.data ?? j;
  const out: SearchHit[] = [];
  const push = (arr: any[]) => {
    for (const it of arr ?? []) {
      if (!it?.url) continue;
      out.push({
        url: it.url,
        title: String(it.title ?? it.url),
        description: String(it.description ?? it.snippet ?? ""),
        preview: it.image ?? it.thumbnail ?? null,
        createdAt: it.date ?? it.publishedDate ?? null,
      });
    }
  };
  if (Array.isArray(data)) push(data);
  else { push(data?.web ?? []); push(data?.news ?? []); }
  return out;
}


// Reddit-native search via public JSON endpoint. Sorted by NEW for accurate latest results,
// with real thumbnails and post timestamps that Google Lens / site:reddit.com cannot give us.
async function redditNativeSearch(subject: string, limit = 25): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const sorts: Array<"new" | "relevance"> = ["new", "relevance"];
  for (const sort of sorts) {
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(`"${subject}"`)}&sort=${sort}&t=month&limit=${limit}&raw_json=1`;
      const r = await fetch(url, { headers: { "User-Agent": "EternaAI-Monitor/1.0 (+https://eternaai.lovable.app)" } });
      if (!r.ok) continue;
      const j: any = await r.json();
      const children: any[] = j?.data?.children ?? [];
      for (const c of children) {
        const d = c?.data; if (!d?.permalink) continue;
        const fullUrl = `https://www.reddit.com${d.permalink}`;
        const preview = d.thumbnail && /^https?:\/\//.test(d.thumbnail)
          ? d.thumbnail
          : (d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&") ?? null);
        out.push({
          url: fullUrl,
          title: String(d.title ?? "Reddit post"),
          description: String(d.selftext ?? "").slice(0, 280),
          preview,
          createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        });
      }
    } catch { /* try next sort */ }
  }
  // Dedupe by url, preserve newest-first order (sort=new ran first).
  const seen = new Set<string>(); const dedup: SearchHit[] = [];
  for (const h of out) { if (seen.has(h.url)) continue; seen.add(h.url); dedup.push(h); }
  return dedup;
}

export const runMultiPlatformScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const searxBase = process.env.SEARXNG_BASE_URL?.trim();
    const searxBearer = process.env.SEARXNG_BEARER?.trim() || undefined;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();

    if (!searxBase && !firecrawlKey) {
      throw new Error("SearXNG search engine is offline. Please start Docker service and set SEARXNG_BASE_URL (see /services/README.md).");
    }

    const subject = data.query.trim();
    const assetId = data.assetId ?? null;
    const source: "searxng" | "firecrawl" = searxBase ? "searxng" : "firecrawl";

    if (assetId) {
      const { data: asset } = await supabase.from("assets").select("id,user_id").eq("id", assetId).maybeSingle();
      if (!asset || asset.user_id !== userId) throw new Error("Asset not found");
    }

    // Fan out one search per platform in parallel.
    const perPlatform = await Promise.all(PLATFORMS.map(async (p) => {
      // Reddit: always use native sorted-by-new JSON endpoint for most accurate fresh results.
      if (p.id === "Reddit") {
        const hits = await redditNativeSearch(subject, 25);
        return { platform: p, hits };
      }
      const query = p.buildQuery(subject);
      const hits = source === "searxng"
        ? await searxngSearch(searxBase!, searxBearer, query, 12)
        : await firecrawlSearch(firecrawlKey!, query, 10);
      const filtered = hits.filter((h) => p.urlFilter(h.url));
      return { platform: p, hits: filtered };
    }));

    const seen = new Set<string>();
    const rows: any[] = [];
    const counters: Record<string, number> = {};
    const discoveredVia = source === "searxng" ? "multi_platform_searxng" : "multi_platform_firecrawl";

    for (const { platform, hits } of perPlatform) {
      counters[platform.id] = 0;
      for (const h of hits) {
        if (seen.has(h.url)) continue;
        seen.add(h.url);
        const textSignal = scoreText(h.title, h.description ?? "", subject);
        const cls = classify(h.title, h.description ?? "");
        const subjectInTitle = `${h.title} ${h.description}`.toLowerCase().includes(subject.toLowerCase());
        const keywordScore = subjectInTitle ? 100 : 50;
        // No visual verification yet — cap to 69 like youtube engine.
        const preFinal = Math.min(69, Math.round(keywordScore * 0.35 + textSignal * 0.25));
        const risk = preFinal >= 60 ? "possible" : "review";
        const profileUrl = profileUrlFor(platform.id, h.url);
        let host = "";
        try { host = new URL(h.url).host.replace(/^www\./, ""); } catch { /* noop */ }
        rows.push({
          asset_id: assetId,
          user_id: userId,
          source_url: h.url,
          platform: platform.id,
          domain: host || platform.domain || null,
          preview_url: h.preview ?? null,
          channel_name: profileUrl ?? host ?? platform.label,
          video_title: h.title.slice(0, 200),
          video_id: null,
          fair_use_flag: cls.fairUse,
          violation_category: cls.category,
          phash_score: 0, dhash_score: 0, clip_score: 0,
          metadata_score: textSignal,
          ai_score: 0,
          final_confidence_score: preFinal,
          risk_level: risk,
          match_type: platform.matchType,
          status: "pending",
          discovered_via: discoveredVia,
          notes: `SOURCE:${source} | PLATFORM:${platform.id} | PROFILE:${profileUrl ?? ""} | HOST:${host} | ${String(h.description ?? "").slice(0, 220)}`,
        });
        counters[platform.id]++;
      }
    }

    // Replace previous multi-platform pending matches for this scope, keep escalated.
    let del = supabase.from("discovered_matches").delete()
      .eq("user_id", userId)
      .in("discovered_via", ["multi_platform_searxng", "multi_platform_firecrawl"])
      .neq("status", "escalated");
    if (assetId) del = del.eq("asset_id", assetId); else del = del.is("asset_id", null);
    await del;

    let inserted = 0;
    if (rows.length) {
      const { data: ins, error } = await supabase.from("discovered_matches").insert(rows).select("id");
      if (error) throw error;
      inserted = ins?.length ?? 0;
    }

    return { inserted, query: subject, counters, platforms: PLATFORMS.length, source };
  });

