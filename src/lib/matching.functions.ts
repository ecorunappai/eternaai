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

export const runRealMatchingScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RealScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: asset, error } = await supabase.from("assets").select("*").eq("id", data.assetId).maybeSingle();
    if (error || !asset) throw new Error("Asset not found");
    if (asset.user_id !== userId) throw new Error("Forbidden");
    if (asset.asset_type !== "image") throw new Error("Reverse image search only supports images.");
    if (!asset.storage_path) throw new Error("Asset has no stored file.");

    // Long-lived signed URL so Google Lens can fetch the image
    const { data: signed, error: sErr } = await supabase.storage
      .from("assets").createSignedUrl(asset.storage_path, 60 * 60 * 24 * 7);
    if (sErr || !signed?.signedUrl) throw new Error("Could not sign asset URL");

    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(signed.signedUrl)}`;

    // Try Firecrawl if available; otherwise fall back to the Playwright Browser Agent.
    const apiKey = process.env.FIRECRAWL_API_KEY;
    let html = "";
    let linksRaw: string[] = [];

    if (apiKey) {
      try {
        const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            url: lensUrl,
            formats: ["links", "html"],
            onlyMainContent: false,
            waitFor: 4500,
            timeout: 45000,
          }),
        });
        if (fcRes.ok) {
          const fcJson: any = await fcRes.json();
          const payload = fcJson?.data ?? fcJson;
          linksRaw = Array.isArray(payload?.links) ? payload.links : [];
          html = typeof payload?.html === "string" ? payload.html : "";
        } else if (fcRes.status !== 402) {
          const txt = await fcRes.text().catch(() => "");
          console.warn(`Firecrawl error (${fcRes.status}): ${txt.slice(0, 200)}`);
        }
        // On 402 (insufficient credits) silently fall through to browser agent.
      } catch (e) {
        console.warn("Firecrawl unavailable, falling back to browser agent", (e as Error).message);
      }
    }

    // Browser Agent fallback: dispatch a web.search task and return "queued".
    if (!html && !linksRaw.length) {
      const baseUrl = process.env.BROWSER_AGENT_URL;
      const token = process.env.BROWSER_AGENT_TOKEN ?? "";
      if (!baseUrl) {
        throw new Error(
          "Reverse image search unavailable: Firecrawl credits are exhausted and the Browser Agent (BROWSER_AGENT_URL) is not configured.",
        );
      }
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            type: "web.search",
            input: {
              lensUrl,
              imageUrl: signed.signedUrl,
              assetId: asset.id,
              assetName: asset.title,
              source: "reverse_image_search",
              platforms: ["google_lens", "web"],
              openLimit: 6,
              queries: [`reverse image match ${asset.title ?? ""}`.trim()],
            },
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`Agent HTTP ${res.status}`);
        const body = (await res.json()) as { task: { id: string } };
        await supabase.from("agent_tasks").upsert(
          {
            user_id: userId,
            worker_task_id: body.task.id,
            type: "web.search",
            status: "queued",
            input: { assetId: asset.id, lensUrl },
          },
          { onConflict: "user_id,worker_task_id" },
        );
        return {
          inserted: 0,
          matches: [],
          queued: true,
          taskId: body.task.id,
          note: "Reverse image scan queued on Browser Agent — results will appear in Violations when analysis completes.",
        };
      } catch (e) {
        throw new Error(
          `Reverse image search unavailable: Firecrawl credits exhausted and Browser Agent dispatch failed (${(e as Error).message}).`,
        );
      }
    }


    const candidates = collectLensCandidates(html, linksRaw);

    if (candidates.length === 0) {
      return { inserted: 0, matches: [], note: "Google Lens returned no external visual matches for this image." };
    }

    // Take top Lens candidates that include a preview image, then verify each with the AI vision layer.
    const top = candidates.filter((c) => c.thumb).slice(0, 8);
    const verified: Array<Candidate & { confidence: number; transformation: string; reason: string }> = [];
    for (const candidate of top) {
      try {
        const verdict = await verifyWithAi(signed.signedUrl, candidate.thumb!, candidate.host);
        if (verdict.same_content && verdict.confidence >= 78) {
          verified.push({
            ...candidate,
            confidence: Math.round(verdict.confidence),
            transformation: verdict.transformation || "AI visual match",
            reason: verdict.reason || "AI verified same content",
          });
        }
      } catch (verifyErr) {
        console.warn("AI visual verification failed", candidate.url, verifyErr);
      }
    }

    await supabase
      .from("discovered_matches")
      .delete()
      .eq("asset_id", asset.id)
      .eq("user_id", userId)
      .or("discovered_via.in.(google_lens_firecrawl,google_lens_firecrawl_ai_verified,tineye_simulated),source_url.ilike.%/u/repost/%")
      .neq("status", "escalated");

    if (verified.length === 0) {
      return {
        inserted: 0,
        matches: [],
        note: "No AI-verified matches found. Similar-looking Google Lens results were filtered out.",
      };
    }

    const rows = verified.map((c, i) => {
      // Confidence now comes from strict multimodal AI comparison, with a tiny Lens-rank adjustment.
      const rankProxy = Math.max(45, Math.round(92 - c.rank * 4));
      const conf = Math.max(0, Math.min(100, Math.round(c.confidence * 0.9 + rankProxy * 0.1)));
      const risk = conf >= 85 ? "confirmed" : conf >= 70 ? "strong" : conf >= 55 ? "possible" : "review";
      return {
        asset_id: asset.id,
        user_id: userId,
        source_url: c.url,
        platform: platformFromHost(c.host),
        domain: c.host,
        preview_url: c.thumb,
        discovered_phash: null,
        phash_score: null,
        dhash_score: null,
        clip_score: conf,
        metadata_score: null,
        ai_score: conf,
        final_confidence_score: conf,
        risk_level: risk,
        match_type: c.transformation || "ai_verified_repost",
        status: "pending",
        discovered_via: "google_lens_firecrawl_ai_verified",
        notes: `AI verified same content · Lens rank #${c.rank + 1} · ${c.reason}`,
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("discovered_matches").insert(rows).select("*");
    if (insErr) throw insErr;
    return { inserted: inserted?.length ?? 0, matches: inserted };
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
