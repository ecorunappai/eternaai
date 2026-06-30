// Eterna YouTube Celebrity/Creator detection engine.
// Pipeline: Firecrawl scrape of youtube.com search → extract video candidates
// (videoId, thumbnail, title, channel) → AI multimodal face/content verification
// against the registered asset → fair-use + violation-type classification → save.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ScanInput = z.object({
  assetId: z.string().uuid(),
  query: z.string().trim().max(120).optional(),
});

type Candidate = {
  videoId: string;
  url: string;
  thumb: string;
  title: string;
  channel: string;
  isShort: boolean;
  rank: number;
};

const VerificationSchema = z.object({
  same_person_or_content: z.boolean(),
  visual_confidence: z.number().min(0).max(100),
  appears_in: z.string().max(60).optional().default("thumbnail"),
  violation_category: z
    .enum([
      "unauthorized_reupload",
      "reaction_video",
      "thumbnail_misuse",
      "face_image_misuse",
      "deepfake_ai_misuse",
      "defamatory_content",
      "fake_celebrity_claim",
      "brand_misuse",
      "identity_impersonation",
      "copyright_infringement",
      "privacy_violation",
      "unrelated",
    ])
    .default("unrelated"),
  fair_use_flag: z
    .enum([
      "high_confidence_unauthorized",
      "clear_reupload",
      "impersonation_fake_profile",
      "defamation_risk",
      "possible_fair_use",
      "needs_legal_review",
      "not_applicable",
    ])
    .default("needs_legal_review"),
  text_signal: z.string().max(160).optional().default(""),
  reason: z.string().max(280).optional().default(""),
});

function decodeHtml(value: string): string {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function collectYouTubeCandidates(html: string): Candidate[] {
  const out: Map<string, Candidate> = new Map();
  // Match ytInitialData JSON objects describing videos. Two common shapes:
  //   videoRenderer  (regular results)
  //   reelItemRenderer / shortsLockupViewModel  (Shorts)
  const videoRegex =
    /"videoId":"([A-Za-z0-9_-]{11})"[^]*?"title":\{"runs":\[\{"text":"([^"]+)"/g;
  const ownerRegex = /"ownerText":\{"runs":\[\{"text":"([^"]+)"/;
  const longByline = /"longBylineText":\{"runs":\[\{"text":"([^"]+)"/;
  const shortsRegex =
    /"reelItemRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"[^]*?"headline":\{"simpleText":"([^"]+)"/g;
  const shortsRegex2 =
    /"shortsLockupViewModel":\{[^]*?"videoId":"([A-Za-z0-9_-]{11})"[^]*?"text":"([^"]+)"/g;

  let m: RegExpExecArray | null;
  let rank = 0;
  while ((m = videoRegex.exec(html)) !== null) {
    const id = m[1];
    if (out.has(id)) continue;
    const tail = html.slice(m.index, m.index + 4000);
    const channel =
      ownerRegex.exec(tail)?.[1] ?? longByline.exec(tail)?.[1] ?? "Unknown channel";
    out.set(id, {
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      title: decodeHtml(m[2]),
      channel: decodeHtml(channel),
      isShort: false,
      rank: rank++,
    });
  }
  for (const re of [shortsRegex, shortsRegex2]) {
    while ((m = re.exec(html)) !== null) {
      const id = m[1];
      if (out.has(id)) continue;
      out.set(id, {
        videoId: id,
        url: `https://www.youtube.com/shorts/${id}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        title: decodeHtml(m[2]),
        channel: "YouTube Shorts",
        isShort: true,
        rank: rank++,
      });
    }
  }
  // Fallback: extract any youtube video IDs from arbitrary HTML
  // (anchors, Google/DDG result links with encoded URLs, shorts URLs).
  if (out.size === 0) {
    const patterns = [
      /\/watch\?v=([A-Za-z0-9_-]{11})/g,
      /youtube\.com%2Fwatch%3Fv%3D([A-Za-z0-9_-]{11})/g,
      /youtu\.be\/([A-Za-z0-9_-]{11})/g,
      /\/shorts\/([A-Za-z0-9_-]{11})/g,
    ];
    for (const re of patterns) {
      while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (out.has(id)) continue;
        const isShort = re.source.includes("shorts");
        out.set(id, {
          videoId: id,
          url: isShort
            ? `https://www.youtube.com/shorts/${id}`
            : `https://www.youtube.com/watch?v=${id}`,
          thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          title: `YouTube ${isShort ? "Short" : "video"} ${id}`,
          channel: "YouTube",
          isShort,
          rank: rank++,
        });
      }
    }
  }
  return Array.from(out.values()).sort((a, b) => a.rank - b.rank);
}

const RISK_KEYWORDS = [
  "reaction", "exposed", "roast", "leaked", "full video", "original",
  "without permission", "uncensored", "deepfake", "ai generated", "fake",
  "scandal", "private", "nude",
];

function textSignalScore(title: string): number {
  const lower = title.toLowerCase();
  let s = 0;
  for (const k of RISK_KEYWORDS) if (lower.includes(k)) s += 14;
  return Math.min(100, s);
}

async function verifyYouTubeCandidate(
  originalUrl: string,
  candidate: Candidate,
  subjectHint: string,
) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY for AI verification.");
  const gateway = createLovableAiGatewayProvider(key);
  const result = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
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
              `You are Eterna AI's YouTube unauthorized-content verifier. Compare REGISTERED reference (image A) against the YouTube ${candidate.isShort ? "Short" : "video"} thumbnail (image B).\n\n` +
              `Video title: "${candidate.title}"\nChannel: "${candidate.channel}"\nSubject hint: "${subjectHint}"\n\n` +
              "Decide if image B contains the SAME person (face match) or the SAME exact creative content (photo/clip reuse) as image A. " +
              "Set same_person_or_content=true only when the face is clearly the same individual or the visual content is reused (cropped, recolored, edited still acceptable). " +
              "Set false for look-alikes, same category/pose but different person, generic stock, unrelated thumbnails. Be strict.\n\n" +
              "Then classify violation_category and fair_use_flag using the title/channel context. " +
              "Reaction/commentary/review/news/parody/education → 'possible_fair_use' or 'needs_legal_review'. " +
              "Direct reupload of the asset → 'clear_reupload' + 'unauthorized_reupload'. " +
              "Face on impersonation channel → 'impersonation_fake_profile' + 'identity_impersonation'. " +
              "Defamatory wording (exposed, scandal, leaked) → 'defamation_risk' + 'defamatory_content'. " +
              "If same_person_or_content=false set violation_category='unrelated' and fair_use_flag='not_applicable'.",
          },
          { type: "file", data: new URL(originalUrl), mediaType: "image" },
          { type: "file", data: new URL(candidate.thumb), mediaType: "image" },
        ],
      },
    ],
  });
  return result.output;
}

export const runYouTubeScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey)
      throw new Error("Firecrawl is not connected. Link the Firecrawl connector and retry.");

    const { data: asset, error } = await supabase
      .from("assets").select("*").eq("id", data.assetId).maybeSingle();
    if (error || !asset) throw new Error("Asset not found");
    if (asset.user_id !== userId) throw new Error("Forbidden");
    if (asset.asset_type !== "image")
      throw new Error("YouTube face/content scan currently supports image references.");
    if (!asset.storage_path) throw new Error("Asset has no stored file.");

    const { data: signed, error: sErr } = await supabase.storage
      .from("assets").createSignedUrl(asset.storage_path, 60 * 60 * 24 * 7);
    if (sErr || !signed?.signedUrl) throw new Error("Could not sign asset URL");

    const subject = (data.query || asset.title || "").trim();
    if (!subject)
      throw new Error("Provide a search query (creator/celebrity name) or set an asset title.");

    async function firecrawlHtml(url: string, waitFor = 3500): Promise<string> {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          url, formats: ["html"], onlyMainContent: false, waitFor, timeout: 45000,
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`Firecrawl error (${r.status}): ${t.slice(0, 300)}`);
      }
      const j: any = await r.json();
      const p = j?.data ?? j;
      return typeof p?.html === "string" ? p.html : "";
    }

    // Source 1: YouTube directly.
    const sources = [
      `https://www.youtube.com/results?search_query=${encodeURIComponent(subject)}`,
      `https://m.youtube.com/results?search_query=${encodeURIComponent(subject)}`,
      // Source 3: Google site-restricted search — robust fallback when YouTube blocks Firecrawl.
      `https://www.google.com/search?q=${encodeURIComponent("site:youtube.com " + subject)}`,
      `https://duckduckgo.com/html/?q=${encodeURIComponent("site:youtube.com " + subject)}`,
    ];

    let candidates: Candidate[] = [];
    let lastErr = "";
    for (const url of sources) {
      try {
        const html = await firecrawlHtml(url, url.includes("youtube.com") ? 4500 : 2500);
        const found = collectYouTubeCandidates(html);
        if (found.length > 0) {
          candidates = found.slice(0, 10);
          break;
        }
      } catch (e: any) {
        lastErr = e?.message || String(e);
      }
    }

    if (candidates.length === 0) {
      return {
        inserted: 0, matches: [],
        note: `No YouTube results found for "${subject}". ${lastErr ? "(" + lastErr + ")" : "YouTube/Google may be blocking the scrape — try a more specific name or retry."}`,
      };
    }

    // AI multimodal verification per candidate (face + content + fair-use classification).
    const verified: Array<Candidate & {
      vis: number; final: number; risk: string;
      category: string; fairUse: string; appearsIn: string; reason: string;
      textSignal: number;
    }> = [];

    function categorizeFromTitle(title: string, channel: string): { category: string; fairUse: string } {
      const t = `${title} ${channel}`.toLowerCase();
      if (/(deepfake|ai generated|ai-generated|fake video)/.test(t)) return { category: "deepfake_ai_misuse", fairUse: "high_confidence_unauthorized" };
      if (/(exposed|scandal|leaked|nude|private)/.test(t)) return { category: "defamatory_content", fairUse: "defamation_risk" };
      if (/(troll|roast|meme)/.test(t)) return { category: "defamatory_content", fairUse: "needs_legal_review" };
      if (/(reaction|review|reacts|reacting|commentary)/.test(t)) return { category: "reaction_video", fairUse: "possible_fair_use" };
      if (/(full video|original|reupload|repost)/.test(t)) return { category: "unauthorized_reupload", fairUse: "clear_reupload" };
      if (/(fan ?page|fanclub|fans|tribute|edit|status)/.test(t)) return { category: "thumbnail_misuse", fairUse: "needs_legal_review" };
      return { category: "thumbnail_misuse", fairUse: "needs_legal_review" };
    }

    for (const c of candidates) {
      const textSignal = textSignalScore(`${c.title} ${c.channel}`);
      const rankProxy = Math.max(40, 95 - c.rank * 5);
      let visual = 0;
      let aiSame = false;
      let aiCategory = "";
      let aiFairUse = "";
      let appearsIn = "thumbnail";
      let reason = "";
      try {
        const v = await verifyYouTubeCandidate(signed.signedUrl, c, subject);
        visual = Math.round(v.visual_confidence);
        aiSame = v.same_person_or_content;
        aiCategory = v.violation_category;
        aiFairUse = v.fair_use_flag;
        appearsIn = v.appears_in || "thumbnail";
        reason = v.reason || "";
      } catch (verifyErr) {
        console.warn("YouTube AI verification failed", c.url, verifyErr);
        reason = "AI verification unavailable — surfaced from search relevance.";
      }

      // Always surface results that match the search subject. AI score is advisory.
      // If AI confirms same person, boost; otherwise use text/rank signal as baseline.
      const baseline = aiSame ? visual : Math.max(35, textSignal, rankProxy - 10);
      const fallback = categorizeFromTitle(c.title, c.channel);
      const category = aiSame && aiCategory && aiCategory !== "unrelated" ? aiCategory : fallback.category;
      const fairUse = aiSame && aiFairUse && aiFairUse !== "not_applicable" ? aiFairUse : fallback.fairUse;
      const final = Math.round(baseline * 0.55 + textSignal * 0.2 + rankProxy * 0.15 + (aiSame ? 10 : 0));
      const risk = final >= 90 ? "confirmed" : final >= 75 ? "strong" : final >= 55 ? "possible" : "review";
      verified.push({
        ...c,
        vis: visual,
        final: Math.min(100, final),
        risk,
        category,
        fairUse,
        appearsIn,
        reason: aiSame ? reason : `Surfaced from YouTube search for "${subject}". ${reason}`.trim(),
        textSignal,
      });
    }

    // Clear previous YouTube matches for this asset that haven't been escalated.
    await supabase
      .from("discovered_matches").delete()
      .eq("asset_id", asset.id).eq("user_id", userId)
      .eq("discovered_via", "youtube_firecrawl_ai_verified")
      .neq("status", "escalated");

    if (verified.length === 0) {
      return {
        inserted: 0, matches: [],
        note: `Scanned ${candidates.length} YouTube results for "${subject}" but none could be scored.`,
      };
    }

    const rows = verified.map((v) => ({
      asset_id: asset.id,
      user_id: userId,
      source_url: v.url,
      platform: "YouTube",
      domain: "youtube.com",
      preview_url: v.thumb,
      channel_name: v.channel,
      video_title: v.title,
      video_id: v.videoId,
      fair_use_flag: v.fairUse,
      violation_category: v.category,
      phash_score: 0,
      dhash_score: 0,
      clip_score: v.vis,
      metadata_score: v.textSignal,
      ai_score: v.vis,
      final_confidence_score: v.final,
      risk_level: v.risk,
      match_type: v.isShort ? "youtube_short" : "youtube_video",
      status: "pending",
      discovered_via: "youtube_firecrawl_ai_verified",
      notes:
        `Appears in ${v.appearsIn} · ${v.fairUse.replace(/_/g, " ")} · ${v.category.replace(/_/g, " ")} · text-signal ${v.textSignal} · ${v.reason}`,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("discovered_matches").insert(rows).select("*");
    if (insErr) throw insErr;
    return { inserted: inserted?.length ?? 0, matches: inserted, query: subject };
  });
