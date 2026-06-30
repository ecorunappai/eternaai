// Eterna Matching Engine — server functions for discovery scan + violation creation.
// In production this would call TinEye / Bing / Google. For this build we synthesize
// realistic candidate matches by perturbing the original hash bits across known
// platforms, then run pure scoring on the server.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeScores } from "./matching";

const PLATFORMS = [
  { domain: "twitter.com", platform: "Twitter/X" },
  { domain: "instagram.com", platform: "Instagram" },
  { domain: "pinterest.com", platform: "Pinterest" },
  { domain: "reddit.com", platform: "Reddit" },
  { domain: "tiktok.com", platform: "TikTok" },
  { domain: "imgur.com", platform: "Imgur" },
  { domain: "tumblr.com", platform: "Tumblr" },
  { domain: "facebook.com", platform: "Facebook" },
  { domain: "weibo.com", platform: "Weibo" },
  { domain: "vk.com", platform: "VK" },
];

function flipHashBits(hex: string, flipCount: number): string {
  const bits: number[] = [];
  for (const c of hex) {
    const n = parseInt(c, 16);
    bits.push((n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1);
  }
  const indices = new Set<number>();
  while (indices.size < Math.min(flipCount, bits.length)) {
    indices.add(Math.floor(Math.random() * bits.length));
  }
  indices.forEach((i) => (bits[i] = bits[i] ^ 1));
  let out = "";
  for (let i = 0; i < bits.length; i += 4) {
    out += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return out;
}

const ScanInput = z.object({ assetId: z.string().uuid() });

export const runMatchingScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: asset, error } = await supabase.from("assets").select("*").eq("id", data.assetId).maybeSingle();
    if (error || !asset) throw new Error("Asset not found");
    if (asset.user_id !== userId) throw new Error("Forbidden");
    if (!asset.phash) throw new Error("Asset has no perceptual hash yet — re-upload to fingerprint.");

    // Synthesize 3–6 candidate matches with varying perturbation
    const candidateCount = 3 + Math.floor(Math.random() * 4);
    const picks = [...PLATFORMS].sort(() => Math.random() - 0.5).slice(0, candidateCount);

    const rows = picks.map((p) => {
      // Bucket distribution: confirmed / strong / possible / review
      const bucket = Math.random();
      const flips =
        bucket < 0.2 ? 1 + Math.floor(Math.random() * 3) :   // 1–3 bit diff → confirmed
        bucket < 0.55 ? 4 + Math.floor(Math.random() * 6) :  // 4–9 → strong
        bucket < 0.85 ? 10 + Math.floor(Math.random() * 8) : // 10–17 → possible
        18 + Math.floor(Math.random() * 14);                 // 18–31 → review
      const dPhash = flipHashBits(asset.phash as string, flips);
      const dDhash = asset.dhash ? flipHashBits(asset.dhash, Math.max(0, flips - 2)) : null;
      const clipSim = Math.max(0, 1 - flips / 48 + (Math.random() - 0.5) * 0.1);
      const metaSim = Math.random() * 0.6;
      const aiSim = Math.max(0, clipSim - 0.05 + (Math.random() - 0.5) * 0.1);

      const scored = computeScores({
        originalPhash: asset.phash, originalDhash: asset.dhash,
        discoveredPhash: dPhash, discoveredDhash: dDhash,
        clipSimilarity: clipSim, metadataSimilarity: metaSim, aiSimilarity: aiSim,
      });

      const slug = (asset.title ?? "asset").toString().replace(/\s+/g, "-").toLowerCase().slice(0, 24);
      return {
        asset_id: asset.id,
        user_id: userId,
        source_url: `https://${p.domain}/u/repost/${asset.id.slice(0, 8)}-${slug}`,
        platform: p.platform,
        domain: p.domain,
        preview_url: null as string | null,
        discovered_phash: dPhash,
        ...scored,
        status: "pending",
        discovered_via: "tineye_simulated",
      };
    });

    const { error: insErr, data: inserted } = await supabase
      .from("discovered_matches").insert(rows).select("*");
    if (insErr) throw insErr;
    return { inserted: inserted?.length ?? 0, matches: inserted };
  });

// ============= REAL reverse-image scan via Firecrawl + Google Lens =============
const RealScanInput = z.object({ assetId: z.string().uuid() });

const EXCLUDED_HOSTS = [
  "google.com", "google.", "gstatic.com", "googleusercontent.com",
  "googleapis.com", "youtube.com/redirect", "schema.org", "w3.org",
  "support.google.com", "policies.google.com", "accounts.google.com",
  "lens.google.com",
];

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
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("Firecrawl is not connected. Link the Firecrawl connector and retry.");

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

    // Firecrawl scrape — request links + html so we can extract result URLs and thumbnails
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

    if (!fcRes.ok) {
      const txt = await fcRes.text().catch(() => "");
      throw new Error(`Firecrawl error (${fcRes.status}): ${txt.slice(0, 300)}`);
    }
    const fcJson: any = await fcRes.json();
    const payload = fcJson?.data ?? fcJson;
    const linksRaw: string[] = Array.isArray(payload?.links) ? payload.links : [];
    const html: string = typeof payload?.html === "string" ? payload.html : "";

    // Extract thumbnail map: <img src="..."> near each anchor (best-effort)
    const thumbMap = new Map<string, string>();
    const imgRegex = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]{0,400}?<img[^>]+src="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(html)) !== null) {
      if (!thumbMap.has(m[1])) thumbMap.set(m[1], m[2]);
    }

    // Normalise + filter
    const seen = new Set<string>();
    const candidates: { url: string; host: string; rank: number; thumb: string | null }[] = [];
    linksRaw.forEach((raw, idx) => {
      try {
        const u = new URL(raw);
        if (!/^https?:$/.test(u.protocol)) return;
        const host = u.hostname.toLowerCase();
        if (EXCLUDED_HOSTS.some((h) => host.includes(h))) return;
        const norm = `${u.origin}${u.pathname}`;
        if (seen.has(norm)) return;
        seen.add(norm);
        candidates.push({ url: raw, host, rank: idx, thumb: thumbMap.get(raw) ?? null });
      } catch { /* skip */ }
    });

    if (candidates.length === 0) {
      return { inserted: 0, matches: [], note: "Google Lens returned no external matches for this image." };
    }

    // Take top 12 by rank
    const top = candidates.slice(0, 12);

    const rows = top.map((c, i) => {
      // Confidence proxy: Lens result rank — top results are usually strongest visual matches.
      // Decay from 92% down to ~45%.
      const conf = Math.max(45, Math.round(92 - i * 4));
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
        clip_score: conf, // visual-rank proxy
        metadata_score: null,
        ai_score: conf,
        final_confidence_score: conf,
        risk_level: risk,
        match_type: "reverse_image",
        status: "pending",
        discovered_via: "google_lens_firecrawl",
        notes: `Google Lens rank #${i + 1} via Firecrawl`,
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
    if (score < 60) throw new Error("Confidence too low for enforcement");

    const threat = score >= 90 ? "critical" : score >= 75 ? "high" : "medium";
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
