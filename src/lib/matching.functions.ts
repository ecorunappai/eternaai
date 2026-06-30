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
      platform: m.platform,
      infringing_url: m.source_url ?? "" as string,
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
