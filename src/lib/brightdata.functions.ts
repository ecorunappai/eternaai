// Bright Data client — SERP API + Web Unlocker.
// Uses the unified https://api.brightdata.com/request endpoint.
// Requires:
//   BRIGHTDATA_API_TOKEN      (set)
//   BRIGHTDATA_SERP_ZONE      (optional, default "serp_api1")
//   BRIGHTDATA_UNLOCKER_ZONE  (optional, default "web_unlocker1")
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detectPlatform, type EternaResult } from "./searxng.functions";

const BRIGHTDATA_URL = "https://api.brightdata.com/request";

export function brightdataConfig() {
  return {
    token: process.env.BRIGHTDATA_API_TOKEN?.trim() || null,
    serpZone: process.env.BRIGHTDATA_SERP_ZONE?.trim() || "serp_api1",
    unlockerZone: process.env.BRIGHTDATA_UNLOCKER_ZONE?.trim() || "web_unlocker1",
  };
}

async function brightdataRequest(url: string, zone: string, format: "raw" | "json" = "raw"): Promise<string> {
  const { token } = brightdataConfig();
  if (!token) throw new Error("BRIGHTDATA_API_TOKEN not configured");
  const res = await fetch(BRIGHTDATA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ zone, url, format }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bright Data ${res.status}: ${body.slice(0, 300)}`);
  }
  return await res.text();
}

/** Fetch any URL via Bright Data Web Unlocker (bypasses geo/anti-bot). */
export async function brightdataUnlock(url: string): Promise<string> {
  const { unlockerZone } = brightdataConfig();
  return brightdataRequest(url, unlockerZone, "raw");
}

/** Run a Google SERP query via Bright Data SERP API. Returns normalized Eterna results. */
export async function brightdataGoogleSearch(query: string, opts: { limit?: number; site?: string } = {}): Promise<EternaResult[]> {
  const { serpZone } = brightdataConfig();
  const q = opts.site ? `site:${opts.site} ${query}` : query;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&brd_json=1&num=${opts.limit ?? 20}`;
  const raw = await brightdataRequest(searchUrl, serpZone, "raw");

  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const organic: any[] = parsed?.organic ?? parsed?.organic_results ?? [];

  return organic.slice(0, opts.limit ?? 20).map((r): EternaResult => {
    const url: string = r.link ?? r.url ?? "";
    const title: string = r.title ?? url;
    const snippet: string = r.description ?? r.snippet ?? "";
    return {
      title,
      url,
      source: "searxng", // reuse existing UI union
      platform: detectPlatform(url),
      snippet,
      thumbnail: r.image ?? r.thumbnail ?? null,
      publishedAt: r.date ?? null,
      riskType: "monitoring",
      matchedKeyword: query,
      confidence: 60,
      engine: "brightdata:google",
    };
  }).filter((r) => r.url);
}

// ---------------------------------------------------------------------------
// Public server functions
// ---------------------------------------------------------------------------

const SearchInput = z.object({
  q: z.string().trim().min(1).max(200),
  platform: z.enum(["youtube", "instagram", "facebook", "tiktok", "x", "reddit", "news", "website", "all"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const brightdataSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }) => {
    const { token } = brightdataConfig();
    if (!token) {
      return { ok: false as const, error: "Bright Data not configured (missing BRIGHTDATA_API_TOKEN)", results: [] as EternaResult[] };
    }
    const siteMap: Record<string, string> = {
      youtube: "youtube.com", instagram: "instagram.com", facebook: "facebook.com",
      tiktok: "tiktok.com", x: "x.com", reddit: "reddit.com",
    };
    const site = data.platform && data.platform !== "all" ? siteMap[data.platform] : undefined;
    try {
      const results = await brightdataGoogleSearch(data.q, { limit: data.limit, site });
      return { ok: true as const, results };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, results: [] as EternaResult[] };
    }
  });

const UnlockInput = z.object({ url: z.string().url() });

export const brightdataFetchUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UnlockInput.parse(d))
  .handler(async ({ data }) => {
    const { token } = brightdataConfig();
    if (!token) return { ok: false as const, error: "Bright Data not configured", html: "" };
    try {
      const html = await brightdataUnlock(data.url);
      return { ok: true as const, html };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, html: "" };
    }
  });
