// Eterna AI — SearXNG client + normalization.
// Targets a self-hosted SearXNG instance (see /services + root docker-compose.yml).
// The app talks to it over HTTPS via SEARXNG_BASE_URL. No vendor APIs required.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type EternaResult = {
  title: string;
  url: string;
  source: "searxng";
  platform: "youtube" | "instagram" | "facebook" | "tiktok" | "x" | "reddit" | "news" | "website";
  snippet: string;
  thumbnail: string | null;
  publishedAt: string | null;
  riskType: string;
  matchedKeyword: string;
  confidence: number;
  engine?: string;
};

const NEWS_HOSTS = /(^|\.)(bbc|cnn|reuters|nytimes|theguardian|washingtonpost|aljazeera|news\.|theverge|techcrunch|bloomberg|forbes|wsj|ft|economist|huffpost|nbcnews|abcnews|cbsnews|foxnews|ndtv|hindustantimes|indiatoday|thehindu|timesofindia|deccanherald)\.[a-z.]+$/i;

export function detectPlatform(url: string): EternaResult["platform"] {
  try {
    const host = new URL(url).host.toLowerCase().replace(/^www\./, "");
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return "youtube";
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
    if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.watch$/.test(host)) return "facebook";
    if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
    if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(host)) return "x";
    if (/(^|\.)reddit\.com$/.test(host)) return "reddit";
    if (NEWS_HOSTS.test(host)) return "news";
    return "website";
  } catch { return "website"; }
}

const RISK_KEYWORDS: Record<string, string> = {
  expose: "defamation", exposed: "defamation", leaked: "leak", scandal: "defamation",
  troll: "harassment", roast: "harassment", controversy: "defamation",
  reaction: "fair_use_review", reupload: "unauthorized_reupload", repost: "unauthorized_reupload",
  deepfake: "deepfake", nude: "abuse", uncensored: "abuse", viral: "viral",
};

function pickRiskType(text: string): string {
  const t = text.toLowerCase();
  for (const [k, v] of Object.entries(RISK_KEYWORDS)) if (t.includes(k)) return v;
  return "monitoring";
}

function pickMatchedKeyword(text: string, keywords: string[]): string {
  const t = text.toLowerCase();
  return keywords.find((k) => k && t.includes(k.toLowerCase())) ?? "";
}

function scoreConfidence(subject: string, title: string, snippet: string): number {
  const text = `${title} ${snippet}`.toLowerCase();
  const s = subject.toLowerCase();
  let score = 0;
  if (text.includes(s)) score += 45;
  if (title.toLowerCase().includes(s)) score += 15;
  for (const k of Object.keys(RISK_KEYWORDS)) if (text.includes(k)) score += 8;
  return Math.min(95, score); // capped — visual verification can lift it later
}

/** Low-level raw SearXNG query. */
export async function searxngQuery(
  baseUrl: string,
  query: string,
  opts: {
    categories?: string;          // "general" | "news" | "images" | "videos" | "social media"
    engines?: string;             // comma list
    timeRange?: "day" | "week" | "month" | "year" | "";
    pageno?: number;
    bearer?: string;
  } = {},
): Promise<any[]> {
  const url = new URL("/search", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "0");
  if (opts.categories) url.searchParams.set("categories", opts.categories);
  if (opts.engines) url.searchParams.set("engines", opts.engines);
  if (opts.timeRange) url.searchParams.set("time_range", opts.timeRange);
  if (opts.pageno) url.searchParams.set("pageno", String(opts.pageno));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(`SearXNG ${res.status}: ${res.statusText}`);
  }
  const j: any = await res.json();
  return Array.isArray(j?.results) ? j.results : [];
}

/** Normalize a raw SearXNG hit into Eterna's monitoring shape. */
export function normalize(raw: any, ctx: { subject: string; keywords: string[] }): EternaResult | null {
  const url = raw?.url; if (!url || typeof url !== "string") return null;
  const title = String(raw.title ?? url);
  const snippet = String(raw.content ?? raw.snippet ?? "");
  const platform = detectPlatform(url);
  return {
    title,
    url,
    source: "searxng",
    platform,
    snippet,
    thumbnail: raw.thumbnail ?? raw.img_src ?? null,
    publishedAt: raw.publishedDate ?? raw.pubdate ?? null,
    riskType: pickRiskType(`${title} ${snippet}`),
    matchedKeyword: pickMatchedKeyword(`${title} ${snippet}`, ctx.keywords),
    confidence: scoreConfidence(ctx.subject, title, snippet),
    engine: raw.engine ?? undefined,
  };
}

/** Helper: are we configured to talk to a self-hosted SearXNG? */
export function searxngConfig(): { baseUrl: string | null; bearer?: string } {
  const baseUrl = process.env.SEARXNG_BASE_URL?.trim() || null;
  const bearer = process.env.SEARXNG_BEARER?.trim() || undefined;
  return { baseUrl, bearer };
}

// ----------------------------------------------------------------------------
// Public server function exposed as a typed RPC to the rest of the app.
// ----------------------------------------------------------------------------

const SearchInput = z.object({
  q: z.string().trim().min(1).max(200),
  category: z.enum(["general", "news", "images", "videos", "social media"]).optional(),
  platform: z.enum(["youtube", "instagram", "facebook", "tiktok", "x", "reddit", "news", "website", "all"]).optional(),
  freshness: z.enum(["day", "week", "month", "year", "any", "latest"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const searxngSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }) => {
    const { baseUrl, bearer } = searxngConfig();
    if (!baseUrl) {
      return {
        ok: false as const,
        error: "SearXNG search engine is offline. Set SEARXNG_BASE_URL to your self-hosted instance (see /services/README.md).",
        results: [] as EternaResult[],
      };
    }

    const limit = data.limit ?? 20;
    const freshness = data.freshness === "latest" ? "month" : (data.freshness === "any" ? "" : data.freshness ?? "");
    let q = data.q;
    let category = data.category;
    if (data.platform && data.platform !== "all") {
      const siteMap: Record<string, string> = {
        youtube: "youtube.com", instagram: "instagram.com", facebook: "facebook.com",
        tiktok: "tiktok.com", x: "x.com", reddit: "reddit.com",
      };
      const site = siteMap[data.platform];
      if (site) q = `site:${site} ${q}`;
      if (data.platform === "news") category = "news";
    }

    try {
      const raws = await searxngQuery(baseUrl, q, {
        categories: category, timeRange: (freshness as any) || undefined, bearer,
      });
      const normalized = raws
        .map((r) => normalize(r, { subject: data.q, keywords: [data.q] }))
        .filter((r): r is EternaResult => !!r)
        .slice(0, limit);
      return { ok: true as const, results: normalized };
    } catch (e) {
      return {
        ok: false as const,
        error: `SearXNG search engine is offline. Please start the Docker service. (${(e as Error).message})`,
        results: [] as EternaResult[],
      };
    }
  });
