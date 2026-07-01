// Eterna Matching Engine — server functions for verified discovery scan + violation creation.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ScanInput = z.object({ assetId: z.string().uuid() });

// ============= REAL reverse-image scan via Firecrawl + Google Lens =============
const RealScanInput = ScanInput;

const EXCLUDED_HOSTS = [
  "google.com", "google.", "gstatic.com", "googleusercontent.com",
  "googleapis.com", "youtube.com/redirect", "schema.org", "w3.org",
  "support.google.com", "policies.google.com", "accounts.google.com",
  "lens.google.com", "localhost", "lovable.app",
];

const FAKE_SOURCE_PATHS = ["/u/repost/", "/repost/"];

const VerificationSchema = z.object({
  same_content: z.boolean(),
  confidence: z.number().min(0).max(100),
  transformation: z.string().max(80).optional().default("visual comparison"),
  reason: z.string().max(240).optional().default(""),
});

type Candidate = { url: string; host: string; rank: number; thumb: string | null };

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isExcludedHost(host: string): boolean {
  return EXCLUDED_HOSTS.some((h) => host.includes(h));
}

function looksLikeFakeSource(url: string): boolean {
  try {
    const parsed = new URL(url);
    return FAKE_SOURCE_PATHS.some((path) => parsed.pathname.includes(path));
  } catch {
    return true;
  }
}

function toAbsoluteUrl(raw: string | null | undefined, base = "https://lens.google.com"): string | null {
  if (!raw) return null;
  const decoded = decodeHtml(raw.trim());
  if (!decoded || decoded.startsWith("data:")) return null;
  try {
    if (decoded.startsWith("//")) return `https:${decoded}`;
    return new URL(decoded, base).toString();
  } catch {
    return null;
  }
}

function normalizeGoogleResultUrl(raw: string): { source: string | null; image: string | null } {
  const absolute = toAbsoluteUrl(raw);
  if (!absolute) return { source: null, image: null };
  try {
    const u = new URL(absolute);
    const directImage = u.searchParams.get("imgurl") || u.searchParams.get("image_url");
    const redirected =
      u.searchParams.get("imgrefurl") ||
      u.searchParams.get("url") ||
      u.searchParams.get("q") ||
      u.searchParams.get("u");
    const source = redirected ? toAbsoluteUrl(redirected) : absolute;
    return { source, image: directImage ? toAbsoluteUrl(directImage) : null };
  } catch {
    return { source: null, image: null };
  }
}

function extractImgFromSnippet(snippet: string): string | null {
  const srcset = snippet.match(/<img[^>]+srcset=["']([^"']+)["']/i)?.[1];
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    const url = toAbsoluteUrl(first);
    if (url) return url;
  }
  const src = snippet.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1];
  return toAbsoluteUrl(src);
}

function collectLensCandidates(html: string, linksRaw: string[]): Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  const add = (rawUrl: string, rank: number, thumb?: string | null) => {
    const normalized = normalizeGoogleResultUrl(rawUrl);
    const sourceUrl = normalized.source;
    const previewUrl = normalized.image || toAbsoluteUrl(thumb) || null;
    if (!sourceUrl) return;
    try {
      const u = new URL(sourceUrl);
      if (!/^https?:$/.test(u.protocol)) return;
      const host = u.hostname.toLowerCase();
      if (isExcludedHost(host)) return;
      if (looksLikeFakeSource(sourceUrl)) return;
      const norm = `${u.origin}${u.pathname}`;
      if (seen.has(norm)) return;
      seen.add(norm);
      candidates.push({ url: sourceUrl, host, rank, thumb: previewUrl });
    } catch { /* skip */ }
  };

  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,1600}?<\/a>/gi;
  let anchor: RegExpExecArray | null;
  while ((anchor = anchorRegex.exec(html)) !== null) {
    const surrounding = html.slice(Math.max(0, anchor.index - 450), Math.min(html.length, anchor.index + anchor[0].length + 900));
    const thumb = extractImgFromSnippet(anchor[0]) || extractImgFromSnippet(surrounding);
    add(anchor[1], candidates.length, thumb);
  }

  linksRaw.forEach((raw, idx) => add(raw, candidates.length + idx, null));
  return candidates;
}

async function verifyWithAi(originalUrl: string, candidateUrl: string, candidateHost: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY for AI visual verification.");

  const gateway = createLovableAiGatewayProvider(key);
  const result = await generateText({
    model: gateway("google/gemini-2.5-flash"),
    output: Output.object({ schema: VerificationSchema }),
    temperature: 0,
    maxRetries: 1,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `You are Eterna AI's copyright matching verifier. Compare image A (registered original) with image B (candidate from ${candidateHost}).\n\n` +
              "Return same_content=true ONLY when image B is the same exact creative work/photo/asset as image A, including resized, cropped, watermarked, recolored, compressed, reposted, or lightly edited versions. " +
              "Return false for a different person, another woman/model, similar pose, similar clothes, same category, meme template, stock-lookalike, or visually related but not the same content. Be strict.",
          },
          { type: "file", data: new URL(originalUrl), mediaType: "image" },
          { type: "file", data: new URL(candidateUrl), mediaType: "image" },
        ],
      },
    ],
  });

  return result.output;
}

function platformFromHost(host: string): string {
  const map: Record<string, string> = {
    "twitter.com": "Twitter/X", "x.com": "Twitter/X",
    "instagram.com": "Instagram", "pinterest.com": "Pinterest",
    "pinterest.co.uk": "Pinterest", "pin.it": "Pinterest",
    "reddit.com": "Reddit", "tiktok.com": "TikTok", "imgur.com": "Imgur",
    "tumblr.com": "Tumblr", "facebook.com": "Facebook", "fb.com": "Facebook",
    "weibo.com": "Weibo", "vk.com": "VK", "flickr.com": "Flickr",
    "behance.net": "Behance", "dribbble.com": "Dribbble",
    "deviantart.com": "DeviantArt", "etsy.com": "Etsy",
    "ebay.com": "eBay", "amazon.com": "Amazon", "alibaba.com": "Alibaba",
    "shopify.com": "Shopify", "medium.com": "Medium", "wordpress.com": "WordPress",
    "linkedin.com": "LinkedIn", "youtube.com": "YouTube",
  };
  for (const k of Object.keys(map)) if (host.endsWith(k)) return map[k];
  return host.replace(/^www\./, "").split(".")[0].replace(/^./, (c) => c.toUpperCase());
}

async function runKeywordPlatformScan(
  supabase: any,
  userId: string,
  asset: any,
): Promise<{ inserted: number; hits: number }> {
  if (!process.env.BRIGHTDATA_API_TOKEN) return { inserted: 0, hits: 0 };
  const { brightdataGoogleSearch } = await import("./brightdata.functions");

  const query = [asset.title, asset.description].filter(Boolean).join(" ").trim();
  if (!query || query.length < 3) return { inserted: 0, hits: 0 };

  const platforms: Array<{ site: string; label: string }> = [
    { site: "youtube.com", label: "YouTube" },
    { site: "instagram.com", label: "Instagram" },
    { site: "tiktok.com", label: "TikTok" },
    { site: "x.com", label: "Twitter/X" },
    { site: "facebook.com", label: "Facebook" },
    { site: "reddit.com", label: "Reddit" },
  ];

  const rows: any[] = [];
  const seen = new Set<string>();
  await Promise.all(platforms.map(async (p) => {
    try {
      const results = await brightdataGoogleSearch(query, { limit: 8, site: p.site });
      for (const r of results) {
        if (!r.url || seen.has(r.url)) continue;
        seen.add(r.url);
        let host = "";
        try { host = new URL(r.url).hostname.toLowerCase(); } catch { continue; }
        rows.push({
          user_id: userId,
          asset_id: asset.id,
          source_url: r.url,
          preview_url: r.thumbnail ?? null,
          platform: p.label,
          domain: host,
          discovered_via: "brightdata_keyword",
          match_type: "keyword",
          phash_score: 0,
          dhash_score: 0,
          clip_score: 0,
          ai_score: 60,
          final_confidence_score: 60,
          risk_level: "medium",
          notes: r.snippet?.slice(0, 240) ?? r.title?.slice(0, 240) ?? "",
          status: "pending_review",
        });
      }
    } catch (e) {
      console.warn(`Keyword scan failed for ${p.site}`, (e as Error).message);
    }
  }));

  if (rows.length === 0) return { inserted: 0, hits: 0 };

  // De-dupe against existing matches for this asset.
  const { data: existing } = await supabase
    .from("discovered_matches")
    .select("source_url")
    .eq("asset_id", asset.id);
  const existingUrls = new Set((existing ?? []).map((e: any) => e.source_url));
  const fresh = rows.filter((r) => !existingUrls.has(r.source_url));
  if (fresh.length === 0) return { inserted: 0, hits: rows.length };

  const { data: inserted, error: insErr } = await supabase
    .from("discovered_matches").insert(fresh).select("id");
  if (insErr) {
    console.warn("Keyword match insert failed", insErr.message);
    return { inserted: 0, hits: rows.length };
  }
  return { inserted: inserted?.length ?? 0, hits: rows.length };
}

export const runRealMatchingScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RealScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: asset, error } = await supabase.from("assets").select("*").eq("id", data.assetId).maybeSingle();
    if (error || !asset) throw new Error("Asset not found");
    if (asset.user_id !== userId) throw new Error("Forbidden");
    if (!asset.storage_path && asset.asset_type === "image") throw new Error("Asset has no stored file.");

    // Parallel: keyword-based multi-platform discovery (YouTube/IG/TikTok/X/FB/Reddit).
    const keywordScan = runKeywordPlatformScan(supabase, userId, asset).catch((e) => {
      console.warn("Keyword scan error", (e as Error).message);
      return { inserted: 0, hits: 0 };
    });

    // Image-only: reverse image search path below.
    if (asset.asset_type !== "image") {
      const kw = await keywordScan;
      return {
        inserted: kw.inserted,
        matches: [],
        via: "keyword",
        note: kw.inserted > 0
          ? `Found ${kw.inserted} keyword match${kw.inserted === 1 ? "" : "es"} across YouTube, Instagram, TikTok, X, Facebook, Reddit.`
          : "No keyword matches surfaced on public platforms.",
      };
    }

    // Long-lived signed URL so the Browser Agent (and each search provider it opens) can fetch the image.
    const { data: signed, error: sErr } = await supabase.storage
      .from("assets").createSignedUrl(asset.storage_path!, 60 * 60 * 24 * 7);
    if (sErr || !signed?.signedUrl) throw new Error("Could not sign asset URL");


    // Preferred path: Bright Data SERP API (Google Lens uploadbyurl) — synchronous.
    if (process.env.BRIGHTDATA_API_TOKEN) {
      try {
        const { brightdataRunLensReverse } = await import("./brightdata-lens.server");
        const candidates = await brightdataRunLensReverse(signed.signedUrl);
        if (candidates.length === 0) {
          return { inserted: 0, matches: [], note: "Bright Data Google Lens returned no candidates." };
        }

        // Verify top 10 candidates with Gemini (visual comparison).
        const verified: Array<{ c: Candidate; v: z.infer<typeof VerificationSchema> }> = [];
        for (const c of candidates.slice(0, 10)) {
          try {
            const v = await verifyWithAi(signed.signedUrl, c.thumb ?? c.url, c.host);
            if (v.same_content && v.confidence >= 55) verified.push({ c, v });
          } catch { /* skip failed verification */ }
        }

        if (verified.length === 0) {
          return {
            inserted: 0,
            matches: [],
            note: `Bright Data found ${candidates.length} lookalikes but none matched under AI visual verification.`,
          };
        }

        const rows = verified.map(({ c, v }) => ({
          user_id: userId,
          asset_id: asset.id,
          source_url: c.url,
          preview_url: c.thumb,
          platform: platformFromHost(c.host),
          domain: c.host,
          discovered_via: "brightdata_lens",
          match_type: "reverse_image",
          phash_score: 0,
          dhash_score: 0,
          clip_score: Math.round(v.confidence),
          ai_score: Math.round(v.confidence),
          final_confidence_score: Math.round(v.confidence),
          risk_level: v.confidence >= 90 ? "critical" : v.confidence >= 75 ? "high" : "medium",
          notes: v.reason || v.transformation,
          status: "pending_review",
        }));
        const { error: insErr, data: inserted } = await supabase
          .from("discovered_matches").insert(rows).select("id");
        if (insErr) throw insErr;

        return {
          inserted: inserted?.length ?? 0,
          matches: verified.map(({ c, v }) => ({ url: c.url, host: c.host, confidence: v.confidence })),
          via: "brightdata",
          note: `Bright Data + AI verification found ${verified.length} match${verified.length === 1 ? "" : "es"}.`,
        };
      } catch (e) {
        console.warn("Bright Data Lens dispatch failed", (e as Error).message);
        // fall through to Browser Agent
      }
    }

    // Fallback: Browser Agent (asynchronous — writes matches when task completes).
    const baseUrl = process.env.BROWSER_AGENT_URL;
    const token = process.env.BROWSER_AGENT_TOKEN ?? "";
    if (!baseUrl) {
      return {
        inserted: 0,
        matches: [],
        fallback: true,
        note: "Reverse image search is offline: neither Bright Data nor the Browser Agent is configured.",
      };
    }


    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: "image.reverse",
          input: {
            imageUrl: signed.signedUrl,
            assetId: asset.id,
            assetName: asset.title ?? "",
            providers: ["google_lens", "bing_visual", "yandex_images"],
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`Browser Agent dispatch failed (${res.status}): ${detail.slice(0, 200)}`);
        return {
          inserted: 0,
          matches: [],
          fallback: true,
          note: `Reverse image search is temporarily unavailable (agent HTTP ${res.status}). It will retry automatically on the next scheduled scan.`,
        };
      }

      const body = (await res.json()) as { task: { id: string } };
      await supabase.from("agent_tasks").upsert(
        {
          user_id: userId,
          worker_task_id: body.task.id,
          type: "image.reverse",
          status: "queued",
          input: { assetId: asset.id, imageUrl: signed.signedUrl },
        },
        { onConflict: "user_id,worker_task_id" },
      );

      return {
        inserted: 0,
        matches: [],
        queued: true,
        taskId: body.task.id,
        note: "Reverse image scan queued on the Browser Agent (Google Lens → Bing Visual → Yandex). Results appear in Violations when analysis completes.",
      };
    } catch (e) {
      console.warn("Browser Agent dispatch error", (e as Error).message);
      return {
        inserted: 0,
        matches: [],
        fallback: true,
        note: `Reverse image search is temporarily unavailable (${(e as Error).message}). It will retry on the next scheduled scan.`,
      };
    }
  });


const CreateViolationInput = z.object({ matchId: z.string().uuid() });

export const createViolationFromMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateViolationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m, error } = await supabase.from("discovered_matches").select("*").eq("id", data.matchId).maybeSingle();
    if (error || !m) throw new Error("Match not found");
    if (m.user_id !== userId) throw new Error("Forbidden");
    const score = Number(m.final_confidence_score ?? 0);
    const threat = score >= 90 ? "critical" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
    const { error: vErr, data: v } = await supabase.from("violations").insert({
      user_id: userId,
      asset_id: m.asset_id,
      match_id: m.id,
      platform: m.platform ?? "unknown",
      infringing_url: m.source_url,
      similarity_score: score,
      confidence_score: score,
      threat_level: threat,
      violation_type: m.match_type,
      status: "open",
      evidence_url: m.preview_url,
      notes: `Auto-created from match: pHash ${m.phash_score}% · dHash ${m.dhash_score}% · CLIP ${m.clip_score}% · AI ${m.ai_score}%`,
    }).select("id").maybeSingle();
    if (vErr) throw vErr;

    await supabase.from("discovered_matches").update({ status: "escalated" }).eq("id", m.id);
    return { violationId: v?.id };
  });
