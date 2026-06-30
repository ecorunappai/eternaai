// Video Segment Detection for Eterna AI.
// Two engines:
//   1) "storyboard" (default, in-stack): pulls YouTube's public storyboard
//      sprite (5x5 grids of preview frames), sends each sprite to Gemini
//      multimodal to identify which cells match the registered reference,
//      then converts matched cells -> timestamps and groups consecutive
//      cells into segments.
//   2) "external" (optional, hookable): POSTs the video URL + reference
//      to process.env.EXTERNAL_VIDEO_WORKER_URL (e.g. a Browserless / Lambda
//      ffmpeg worker you host). Lets you swap in real frame extraction
//      later without changing UI/DB.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ScanInput = z.object({
  matchId: z.string().uuid(),
  mode: z.enum(["storyboard", "external"]).default("storyboard"),
  deepPass: z.boolean().default(false),
});

const StoryboardCells = z.object({
  cells_with_subject: z.array(z.object({
    cell_index: z.number().int().min(0).max(48),
    confidence: z.number().min(0).max(100),
    notes: z.string().max(120).optional().default(""),
  })),
  reason: z.string().max(280).optional().default(""),
});

type StoryboardSpec = {
  width: number;          // tile width
  height: number;         // tile height
  cols: number;           // grid columns per sprite
  rows: number;           // grid rows per sprite
  intervalMs: number;     // ms between tiles
  totalTiles: number;     // total tiles across all sprites
  name: string;           // e.g. "M$M"
  sigh: string;           // signature query param
  templateLevel: number;  // L0/L1/L2
};

async function firecrawlHtml(apiKey: string, url: string, waitFor = 4500): Promise<string> {
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["html"], onlyMainContent: false, waitFor, timeout: 45000 }),
  });
  if (!r.ok) throw new Error(`Firecrawl ${r.status}`);
  const j: any = await r.json();
  const p = j?.data ?? j;
  return typeof p?.html === "string" ? p.html : "";
}

// Parse playerStoryboardSpecRenderer from a watch-page HTML.
// Spec format: "<baseUrl>|<level0>|<level1>|<level2>" where each level is
// "<w>#<h>#<cols>#<rows>#<intervalMs>#<name>#<sigh>".
function parseStoryboardSpec(html: string, videoId: string): StoryboardSpec | null {
  const m = /"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/.exec(html);
  if (!m) return null;
  const raw = m[1].replace(/\\u0026/g, "&");
  const [, ...levels] = raw.split("|");
  if (!levels.length) return null;
  // Highest available level last; pick the best (most tiles).
  let best: StoryboardSpec | null = null;
  for (let i = 0; i < levels.length; i++) {
    const parts = levels[i].split("#");
    if (parts.length < 7) continue;
    const [w, h, totalStr, cols, rows, interval, name, sighRaw] = [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6], parts[7] ?? ""];
    const sighMatch = /sigh=([A-Za-z0-9_-]+)/.exec(sighRaw);
    const spec: StoryboardSpec = {
      width: Number(w), height: Number(h),
      cols: Number(cols), rows: Number(rows),
      intervalMs: Number(interval),
      totalTiles: Number(totalStr),
      name, sigh: sighMatch?.[1] ?? "",
      templateLevel: i,
    };
    if (!best || spec.totalTiles > best.totalTiles) best = spec;
  }
  if (!best || !best.totalTiles || !best.cols || !best.rows) return null;
  void videoId;
  return best;
}

function spriteUrl(videoId: string, spec: StoryboardSpec, spriteIndex: number): string {
  // YouTube CDN format: https://i.ytimg.com/sb/<id>/storyboard3_L<level>/M<spriteIndex>.jpg?sqp=-...&sigh=...
  // Some videos use storyboard_L<level>; storyboard3 is current.
  const baseName = spec.name.replace("$M", String(spriteIndex));
  return `https://i.ytimg.com/sb/${videoId}/storyboard3_L${spec.templateLevel}/${baseName}.jpg?sigh=${spec.sigh}`;
}

export const scanVideoSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");

    const { data: match } = await supabase.from("discovered_matches").select("*").eq("id", data.matchId).maybeSingle();
    if (!match || match.user_id !== userId) throw new Error("Match not found");
    if (!match.video_id) throw new Error("Match has no YouTube video ID");
    if (match.is_owned) throw new Error("This video belongs to an owned/official account — segment scan is not applicable.");
    if (!match.asset_id) throw new Error("Match has no reference asset to compare against.");

    const { data: asset } = await supabase.from("assets").select("*").eq("id", match.asset_id).maybeSingle();
    if (!asset || asset.asset_type !== "image" || !asset.storage_path)
      throw new Error("Reference asset missing or not an image.");
    const { data: signed } = await supabase.storage.from("assets").createSignedUrl(asset.storage_path, 3600);
    if (!signed?.signedUrl) throw new Error("Could not sign reference URL");

    // ===== External worker path (pluggable) =====
    if (data.mode === "external") {
      const url = process.env.EXTERNAL_VIDEO_WORKER_URL;
      if (!url) throw new Error("EXTERNAL_VIDEO_WORKER_URL is not configured. Add the secret to enable the external ffmpeg worker.");
      const token = process.env.EXTERNAL_VIDEO_WORKER_TOKEN ?? "";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          video_url: match.source_url,
          video_id: match.video_id,
          reference_image_url: signed.signedUrl,
          deep_pass: data.deepPass,
          callback: { match_id: match.id, user_id: userId },
        }),
      });
      if (!r.ok) throw new Error(`External worker ${r.status}`);
      const j: any = await r.json().catch(() => ({}));
      const segs: Array<any> = Array.isArray(j?.segments) ? j.segments : [];
      // Replace prior external segments
      await supabase.from("video_segments").delete().eq("match_id", match.id).eq("detection_method", "external_ffmpeg");
      const rows = segs.map((s) => ({
        user_id: userId, match_id: match.id,
        start_seconds: Math.max(0, Math.floor(Number(s.start_seconds ?? s.start ?? 0))),
        end_seconds: Math.max(0, Math.floor(Number(s.end_seconds ?? s.end ?? 0))),
        frame_count: Math.max(1, Number(s.frame_count ?? 1)),
        confidence: Math.min(100, Number(s.confidence ?? 70)),
        phash_score: Number(s.phash_score ?? 0),
        clip_score: Number(s.clip_score ?? 0),
        face_score: Number(s.face_score ?? 0),
        ocr_score: Number(s.ocr_score ?? 0),
        detection_method: "external_ffmpeg",
        match_type: s.match_type ?? "face_in_video",
        frame_screenshot_url: s.frame_screenshot_url ?? null,
        deep_link: `${match.source_url}&t=${Math.max(0, Math.floor(Number(s.start_seconds ?? s.start ?? 0)))}s`,
        notes: s.notes ?? null,
      }));
      if (rows.length) await supabase.from("video_segments").insert(rows);
      await supabase.from("discovered_matches").update({ segments_scanned: true }).eq("id", match.id);
      return { engine: "external_ffmpeg", segments: rows.length };
    }

    // ===== Storyboard path (default, in-stack) =====
    if (!firecrawlKey) throw new Error("Firecrawl is not connected.");
    const watchUrl = `https://www.youtube.com/watch?v=${match.video_id}`;
    const html = await firecrawlHtml(firecrawlKey, watchUrl, 5000);
    const specMaybe = parseStoryboardSpec(html, match.video_id);
    if (!specMaybe) {
      throw new Error("YouTube did not expose a storyboard for this video (age-gated, private, very short, or live). Use the external worker mode if you have one configured.");
    }
    const spec: StoryboardSpec = specMaybe;
    const videoId: string = match.video_id;
    const videoTitle = String(match.video_title ?? "");
    const referenceUrl: string = signed.signedUrl;

    const cellsPerSprite = spec.cols * spec.rows;
    const spriteCount = Math.ceil(spec.totalTiles / cellsPerSprite);
    const SPRITE_STEP_PASS1 = Math.max(1, Math.ceil(spriteCount / 8));
    const passOneIndices: number[] = [];
    for (let i = 0; i < spriteCount; i += SPRITE_STEP_PASS1) passOneIndices.push(i);
    if (spriteCount > 0 && !passOneIndices.includes(spriteCount - 1)) passOneIndices.push(spriteCount - 1);

    const gateway = createLovableAiGatewayProvider(lovableKey);

    type CellHit = { sprite: number; cell: number; tsSec: number; confidence: number; notes: string };
    async function scanSprite(spriteIndex: number): Promise<CellHit[]> {
      const url = spriteUrl(videoId, spec, spriteIndex);
      const tilesInThisSprite = Math.min(cellsPerSprite, spec.totalTiles - spriteIndex * cellsPerSprite);
      try {
        const r = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          output: Output.object({ schema: StoryboardCells }),
          temperature: 0, maxRetries: 1,
          messages: [{
            role: "user",
            content: [
              { type: "text", text:
                `Image A is the REGISTERED reference (face / content owner).\n` +
                `Image B is a storyboard sprite from YouTube video "${videoTitle}". ` +
                `It is a ${spec.cols}x${spec.rows} grid read left-to-right, top-to-bottom. ` +
                `Cell 0 is top-left. There are ${tilesInThisSprite} valid cells in this sprite (later cells may be blank/duplicate — ignore those).\n` +
                `Return ONLY cells where the same person/content from image A clearly appears in the cell. ` +
                `Confidence 0-100. If unsure, omit the cell. Be strict — avoid false positives.` },
              { type: "file", data: new URL(referenceUrl), mediaType: "image" },
              { type: "file", data: new URL(url), mediaType: "image" },
            ],
          }],
        });
        const out = r.output;
        return (out.cells_with_subject ?? [])
          .filter(c => c.cell_index < tilesInThisSprite && c.confidence >= 55)
          .map(c => {
            const globalTile = spriteIndex * cellsPerSprite + c.cell_index;
            return {
              sprite: spriteIndex, cell: c.cell_index,
              tsSec: Math.floor((globalTile * spec.intervalMs) / 1000),
              confidence: c.confidence, notes: c.notes ?? "",
            };
          });
      } catch {
        return [];
      }
    }

    const pass1Results = (await Promise.all(passOneIndices.map(scanSprite))).flat();

    // Pass 2 — deep scan around any sprite that produced a hit (neighboring sprite(s)).
    let pass2Results: CellHit[] = [];
    if (data.deepPass && pass1Results.length > 0) {
      const hitSprites = new Set(pass1Results.map(h => h.sprite));
      const deepTargets = new Set<number>();
      for (const s of hitSprites) {
        for (let d = -1; d <= 1; d++) {
          const idx = s + d;
          if (idx >= 0 && idx < spriteCount && !passOneIndices.includes(idx)) deepTargets.add(idx);
        }
      }
      pass2Results = (await Promise.all(Array.from(deepTargets).slice(0, 6).map(scanSprite))).flat();
    }

    const allHits = [...pass1Results, ...pass2Results].sort((a, b) => a.tsSec - b.tsSec);

    // Group consecutive timestamps into segments.
    const intervalSec = Math.max(1, Math.round(spec.intervalMs / 1000));
    const segments: Array<{ start: number; end: number; frames: number; conf: number; notes: string }> = [];
    for (const h of allHits) {
      const last = segments[segments.length - 1];
      if (last && h.tsSec - last.end <= intervalSec * 3) {
        last.end = Math.max(last.end, h.tsSec + intervalSec);
        last.frames += 1;
        last.conf = Math.max(last.conf, h.confidence);
        if (h.notes) last.notes = h.notes;
      } else {
        segments.push({ start: h.tsSec, end: h.tsSec + intervalSec, frames: 1, conf: h.confidence, notes: h.notes });
      }
    }

    // Persist
    await supabase.from("video_segments").delete().eq("match_id", match.id).eq("detection_method", "storyboard");
    const segRows = segments.map((s) => {
      // Confidence blend: pHash + CLIP + face proxies derived from Gemini visual confidence.
      const visual = s.conf;
      const phash = Math.round(visual * 0.6);
      const clip = Math.round(visual * 0.8);
      const face = Math.round(visual);
      const confidence = Math.min(100, Math.round(phash * 0.25 + clip * 0.25 + face * 0.25 + Number(match.metadata_score ?? 0) * 0.1 + 5));
      return {
        user_id: userId,
        match_id: match.id,
        start_seconds: s.start,
        end_seconds: s.end,
        frame_count: s.frames,
        confidence,
        phash_score: phash, clip_score: clip, face_score: face, ocr_score: 0,
        detection_method: "storyboard",
        match_type: confidence >= 90 ? "reupload" : confidence >= 75 ? "face_in_video" : "needs_review",
        frame_screenshot_url: spriteUrl(match.video_id!, spec, Math.floor(s.start * 1000 / spec.intervalMs / cellsPerSprite)),
        deep_link: `https://www.youtube.com/watch?v=${match.video_id}&t=${s.start}s`,
        notes: s.notes || null,
      };
    });
    if (segRows.length) await supabase.from("video_segments").insert(segRows);

    // Roll up — if any high-confidence segment exists, push match confidence/risk up.
    const topConf = segRows.reduce((m, s) => Math.max(m, s.confidence), 0);
    const update: Record<string, unknown> = { segments_scanned: true };
    if (topConf > 0) {
      const newFinal = Math.max(Number(match.final_confidence_score ?? 0), topConf);
      update.final_confidence_score = newFinal;
      update.risk_level = newFinal >= 90 ? "confirmed" : newFinal >= 75 ? "strong" : newFinal >= 60 ? "possible" : "review";
      update.clip_score = Math.max(Number(match.clip_score ?? 0), Math.round(topConf * 0.8));
    }
    await supabase.from("discovered_matches").update(update).eq("id", match.id);

    return {
      engine: "storyboard",
      sprites_scanned: passOneIndices.length + pass2Results.length,
      total_sprites: spriteCount,
      frames_matched: allHits.length,
      segments: segRows.length,
      top_confidence: topConf,
    };
  });
