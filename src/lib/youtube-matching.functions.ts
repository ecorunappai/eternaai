// Eterna YouTube multi-keyword discovery + on-demand face verification.
// Pipeline:
//   1) Expand subject name into many keyword variants (English + Malayalam/Tamil/Hindi cues + troll/reaction/issue/etc.)
//   2) Scrape multiple discovery sources via Firecrawl (YouTube desktop/mobile/shorts + Google + DuckDuckGo)
//   3) Extract video candidates (videoId, title, channel, thumb, isShort)
//   4) Score on KEYWORD + METADATA only — surface results immediately ("Needs Visual Review")
//   5) Visual face/content verification runs on demand from the dashboard via verifyYouTubeMatch.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ScanInput = z.object({
  assetId: z.string().uuid(),
  query: z.string().trim().min(2).max(120),
});

const VerifyInput = z.object({ matchId: z.string().uuid() });

type Candidate = {
  videoId: string;
  url: string;
  thumb: string;
  title: string;
  channel: string;
  isShort: boolean;
  rank: number;
  matchedKeyword: string;
};

const VerificationSchema = z.object({
  same_person_or_content: z.boolean(),
  visual_confidence: z.number().min(0).max(100),
  appears_in: z.string().max(60).optional().default("thumbnail"),
  violation_category: z
    .enum([
      "unauthorized_reupload", "reaction_video", "thumbnail_misuse", "face_image_misuse",
      "deepfake_ai_misuse", "defamatory_content", "fake_celebrity_claim", "brand_misuse",
      "identity_impersonation", "copyright_infringement", "privacy_violation", "unrelated",
    ]).default("unrelated"),
  fair_use_flag: z
    .enum([
      "high_confidence_unauthorized", "clear_reupload", "impersonation_fake_profile",
      "defamation_risk", "possible_fair_use", "needs_legal_review", "not_applicable",
    ]).default("needs_legal_review"),
  reason: z.string().max(280).optional().default(""),
});

function decodeHtml(value: string): string {
  return value
    .replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// English keyword pool. Each query becomes `${subject} ${suffix}`.
const ENGLISH_SUFFIXES = [
  "", "reaction", "troll", "issue", "controversy", "exposed", "viral", "roast",
  "news", "latest issue", "family issue", "interview reaction", "shorts",
  "reels reaction", "fan video", "edit", "fake news", "leaked", "scandal",
  "Malayalam troll", "Malayalam reaction", "Tamil reaction", "Tamil troll",
  "Hindi reaction", "Hindi news",
];

// Regional keyword cues. If the subject contains non-Latin characters we also
// append these. Users can also paste a native-script name directly as subject.
const MALAYALAM_SUFFIXES = ["ട്രോൾ", "പ്രശ്നം", "വാർത്ത", "വിവാദം", "റിയാക്ഷൻ", "വൈറൽ", "ഫാൻസ്", "വീഡിയോ"];

function isNonLatin(s: string) { return /[^\u0000-\u024F]/.test(s); }

function expandQueries(subject: string): string[] {
  const base = subject.trim();
  const set = new Set<string>();
  for (const suf of ENGLISH_SUFFIXES) set.add(suf ? `${base} ${suf}` : base);
  // Always pair with Malayalam cues — users monitoring South Indian creators rely on these.
  for (const suf of MALAYALAM_SUFFIXES) set.add(`${base} ${suf}`);
  if (isNonLatin(base)) for (const suf of MALAYALAM_SUFFIXES) set.add(`${base} ${suf}`);
  return Array.from(set);
}

// Risk keyword scoring on the title+channel.
const RISK_KEYWORDS: Record<string, number> = {
  reaction: 14, troll: 18, roast: 16, exposed: 22, scandal: 22, leaked: 24,
  controversy: 18, "fake news": 20, deepfake: 26, "ai generated": 22,
  "ai-generated": 22, viral: 8, issue: 12, "full video": 18, original: 10,
  reupload: 22, repost: 18, news: 6, edit: 6, "fan page": 6, fanclub: 6,
  meme: 10, "without permission": 24, uncensored: 22, private: 18, nude: 28,
  shorts: 4, reel: 4, reels: 4,
};

function textSignalScore(title: string, channel: string, subject: string): number {
  const lower = `${title} ${channel}`.toLowerCase();
  const subjLower = subject.toLowerCase();
  let s = 0;
  if (lower.includes(subjLower)) s += 35;
  for (const [k, w] of Object.entries(RISK_KEYWORDS)) if (lower.includes(k)) s += w;
  // Malayalam token bonus.
  if (/[\u0D00-\u0D7F]/.test(title)) s += 10;
  return Math.min(100, s);
}

function categorizeFromTitle(title: string, channel: string): { category: string; fairUse: string; risk: string } {
  const t = `${title} ${channel}`.toLowerCase();
  if (/(deepfake|ai generated|ai-generated|fake video)/.test(t)) return { category: "deepfake_ai_misuse", fairUse: "high_confidence_unauthorized", risk: "Deepfake / AI Misuse" };
  if (/(exposed|scandal|leaked|nude|private)/.test(t)) return { category: "defamatory_content", fairUse: "defamation_risk", risk: "Defamation Risk" };
  if (/(troll|roast|meme)/.test(t) || /ട്രോൾ/.test(title)) return { category: "defamatory_content", fairUse: "needs_legal_review", risk: "Troll Video" };
  if (/(reaction|reacts|reacting|commentary|review)/.test(t) || /റിയാക്ഷൻ/.test(title)) return { category: "reaction_video", fairUse: "possible_fair_use", risk: "Reaction Video" };
  if (/(news|വാർത്ത)/.test(t)) return { category: "defamatory_content", fairUse: "needs_legal_review", risk: "News Video" };
  if (/(full video|original|reupload|repost)/.test(t)) return { category: "unauthorized_reupload", fairUse: "clear_reupload", risk: "Reupload" };
  if (/(fan ?page|fanclub|fans|tribute|edit|status|ഫാൻസ്)/.test(t)) return { category: "thumbnail_misuse", fairUse: "needs_legal_review", risk: "Fan Edit" };
  return { category: "thumbnail_misuse", fairUse: "needs_legal_review", risk: "Fair Use / Needs Review" };
}

function resultCategoryFromSignals(title: string, channel: string, _matchedKeyword: string): string {
  // Categorize strictly from the actual video title/channel, NOT the search
  // keyword used to discover it (otherwise every result from the "news" pass
  // gets tagged as news even when the video itself is unrelated).
  const t = `${title} ${channel}`.toLowerCase();
  if (/(deepfake|ai[- ]generated|fake video|fake celebrity|impersonat)/.test(t)) return "impersonation";
  if (/(reaction|reacts|reacting|റിയാക്ഷൻ)/.test(t)) return "reaction";
  if (/(troll|roast|meme|ട്രോൾ)/.test(t)) return "troll";
  if (/\b(news|commentary|വാർത്ത|breaking|controversy|exposed|scandal|interview|podcast)\b/.test(t)) return "news";
  if (/(full video|reupload|repost|leaked|without permission)/.test(t)) return "reupload";
  if (/(fan ?page|fanclub|fans|tribute|status|ഫാൻസ്)/.test(t)) return "fan";
  return "needs_review";
}

function collectYouTubeCandidates(html: string, matchedKeyword: string, startRank: number): Candidate[] {
  const out: Map<string, Candidate> = new Map();
  const videoRegex = /"videoId":"([A-Za-z0-9_-]{11})"[^]*?"title":\{"runs":\[\{"text":"([^"]+)"/g;
  const ownerRegex = /"ownerText":\{"runs":\[\{"text":"([^"]+)"/;
  const longByline = /"longBylineText":\{"runs":\[\{"text":"([^"]+)"/;
  const shortsRegex = /"reelItemRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"[^]*?"headline":\{"simpleText":"([^"]+)"/g;
  const shortsRegex2 = /"shortsLockupViewModel":\{[^]*?"videoId":"([A-Za-z0-9_-]{11})"[^]*?"text":"([^"]+)"/g;

  let m: RegExpExecArray | null;
  let rank = startRank;
  while ((m = videoRegex.exec(html)) !== null) {
    const id = m[1];
    if (out.has(id)) continue;
    const tail = html.slice(m.index, m.index + 4000);
    const channel = ownerRegex.exec(tail)?.[1] ?? longByline.exec(tail)?.[1] ?? "Unknown channel";
    out.set(id, {
      videoId: id, url: `https://www.youtube.com/watch?v=${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      title: decodeHtml(m[2]), channel: decodeHtml(channel),
      isShort: false, rank: rank++, matchedKeyword,
    });
  }
  for (const re of [shortsRegex, shortsRegex2]) {
    while ((m = re.exec(html)) !== null) {
      const id = m[1];
      if (out.has(id)) continue;
      out.set(id, {
        videoId: id, url: `https://www.youtube.com/shorts/${id}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        title: decodeHtml(m[2]), channel: "YouTube Shorts",
        isShort: true, rank: rank++, matchedKeyword,
      });
    }
  }
  // Fallback: extract YouTube IDs from arbitrary HTML (Google / DuckDuckGo results).
  if (out.size === 0) {
    const patterns: Array<[RegExp, boolean]> = [
      [/\/watch\?v=([A-Za-z0-9_-]{11})/g, false],
      [/youtube\.com%2Fwatch%3Fv%3D([A-Za-z0-9_-]{11})/g, false],
      [/youtu\.be\/([A-Za-z0-9_-]{11})/g, false],
      [/\/shorts\/([A-Za-z0-9_-]{11})/g, true],
    ];
    for (const [re, isShort] of patterns) {
      while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (out.has(id)) continue;
        out.set(id, {
          videoId: id,
          url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
          thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          title: `YouTube ${isShort ? "Short" : "video"} ${id}`,
          channel: "YouTube", isShort, rank: rank++, matchedKeyword,
        });
      }
    }
  }
  return Array.from(out.values()).sort((a, b) => a.rank - b.rank);
}

async function firecrawlHtml(apiKey: string, url: string, waitFor = 2500): Promise<string> {
  // One quick attempt, then a shorter fallback so a SCRAPE_TIMEOUT (408) on a
  // single date-filtered pass doesn't surface as a hard error to the user.
  const attempts: Array<{ waitFor: number; timeout: number; abortMs: number }> = [
    { waitFor, timeout: 18000, abortMs: 20000 },
    { waitFor: 800, timeout: 9000, abortMs: 11000 },
  ];
  let lastErr: any = null;
  for (const a of attempts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), a.abortMs);
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ url, formats: ["html"], onlyMainContent: false, waitFor: a.waitFor, timeout: a.timeout }),
        signal: ctrl.signal,
      });
      if (r.status === 408) { lastErr = new Error("Firecrawl 408 timeout"); continue; }
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`Firecrawl ${r.status}: ${t.slice(0, 160)}`);
      }
      const j: any = await r.json();
      const p = j?.data ?? j;
      return typeof p?.html === "string" ? p.html : "";
    } catch (e) {
      lastErr = e;
    } finally { clearTimeout(timer); }
  }
  // Soft-fail: return empty HTML so the pass is recorded as "no candidates"
  // instead of crashing the scan job. Caller logs from passStats.
  console.warn("firecrawlHtml soft-fail", url, lastErr?.message || lastErr);
  return "";
}

// YouTube search sort tokens (`&sp=...`). Encoded values match the actual
// filter chip URLs YouTube generates when you pick "Sort by".
const SORT_MODES: Array<{ label: string; sp: string }> = [
  { label: "relevance", sp: "" },
  { label: "upload_date", sp: "CAI%253D" },
  { label: "view_count", sp: "CAMSAhAB" },
];
const SHORTS_ONLY_SP = "EgIYAQ%253D%253D";
// YouTube upload-date filter chips (no sort encoded — combines cleanly with our default ordering).
const DATE_FILTERS: Array<{ label: string; sp: string }> = [
  { label: "today", sp: "EgIIAg%253D%253D" },
  { label: "this_week", sp: "EgIIAw%253D%253D" },
  { label: "this_month", sp: "EgIIBA%253D%253D" },
];
const YEAR_SUFFIXES = ["2026", "2025", "2024", "2023", "2022", "2021", "2020"];
const GOOGLE_SUFFIXES = ["", "reaction", "troll", "issue", "controversy", "exposed", "scandal", "interview", "news", "podcast", "livestream"];
// Recency intent keywords appended to date-filtered passes so the news/commentary tab refreshes.
const RECENT_INTENT = ["", "news", "latest", "today", "controversy", "reaction", "troll", "interview", "viral"];

export const runYouTubeScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("Firecrawl is not connected. Link the Firecrawl connector and retry.");
    const fcKey: string = apiKey;

    let assetId: string;
    {
      const { data: asset } = await supabase.from("assets").select("id,user_id").eq("id", data.assetId).maybeSingle();
      if (!asset || asset.user_id !== userId) throw new Error("Asset not found");
      assetId = asset.id;
    }

    const subject = data.query.trim();
    const keywordQueries = expandQueries(subject);

    // ---------- Build the deep multi-pass URL plan ----------
    type SourceTask = { url: string; matchedKeyword: string; pass: string };
    const plan: SourceTask[] = [];
    const ytSearch = (q: string, sp: string) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}${sp ? `&sp=${sp}` : ""}`;
    const mYtSearch = (q: string, sp: string) =>
      `https://m.youtube.com/results?search_query=${encodeURIComponent(q)}${sp ? `&sp=${sp}` : ""}`;
    const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}&num=50`;
    const ddg = (q: string) => `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

    // Pass 1-3: per-keyword × relevance/date/views (covers latest + old + popular).
    const KEYWORD_CAP = 8;
    for (const q of keywordQueries.slice(0, KEYWORD_CAP)) {
      for (const mode of SORT_MODES) {
        plan.push({ url: ytSearch(q, mode.sp), matchedKeyword: q, pass: `yt_${mode.label}` });
      }
    }
    // Pass 1b (PRIORITY): YouTube upload-date filters × recent intent keywords
    // — guarantees this-week / this-month videos surface even when the cached
    // result set is dominated by older uploads.
    for (const df of DATE_FILTERS) {
      for (const intent of RECENT_INTENT) {
        const q = intent ? `${subject} ${intent}` : subject;
        plan.unshift({ url: ytSearch(q, df.sp), matchedKeyword: q, pass: `yt_${df.label}` });
      }
    }
    // Pass 4: shorts-only filter on the base subject + top intent keywords.
    for (const q of [subject, `${subject} troll`, `${subject} reaction`]) {
      plan.push({ url: ytSearch(q, SHORTS_ONLY_SP), matchedKeyword: q, pass: "yt_shorts" });
    }
    // Pass 5: channels search.
    plan.push({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(subject)}&sp=EgIQAg%253D%253D`, matchedKeyword: subject, pass: "yt_channels" });
    // Pass 6: Google site:youtube.com keyword searches (trimmed).
    for (const suf of ["", "reaction", "troll", "controversy", "news"]) {
      const q = suf ? `site:youtube.com "${subject}" ${suf}` : `site:youtube.com "${subject}"`;
      plan.push({ url: google(q), matchedKeyword: `google:${suf || "base"}`, pass: "google_site" });
    }
    // Pass 7: regional language Google searches.
    for (const suf of ["malayalam", "tamil", "hindi"]) {
      plan.push({ url: google(`site:youtube.com "${subject}" ${suf}`), matchedKeyword: `google:${suf}`, pass: "google_regional" });
    }
    // Pass 8: year-by-year historical discovery on YouTube date-sorted.
    for (const year of YEAR_SUFFIXES) {
      plan.push({ url: ytSearch(`${subject} ${year}`, SORT_MODES[1].sp), matchedKeyword: `${subject} ${year}`, pass: "yt_year" });
    }
    // Pass 9: mobile YouTube relevance — different layout often surfaces extras.
    plan.push({ url: mYtSearch(subject, ""), matchedKeyword: subject, pass: "myt" });

    // ---------- Create scan job for real-time progress + history ----------
    const { data: jobRow, error: jobErr } = await supabase
      .from("scan_jobs")
      .insert({
        user_id: userId, asset_id: assetId, kind: "youtube", query: subject,
        status: "running", total_passes: plan.length, passes_done: 0, progress: 0,
        current_pass: "starting",
      })
      .select("id").single();
    if (jobErr) throw jobErr;
    const jobId = jobRow.id;
    let lastProgressWrite = 0;
    async function writeProgress(force = false) {
      const now = Date.now();
      if (!force && now - lastProgressWrite < 1500) return;
      lastProgressWrite = now;
      await supabase.from("scan_jobs").update({
        passes_done: passesDone,
        progress: Math.round((passesDone / Math.max(1, plan.length)) * 100),
        current_pass: lastPass,
        candidates_found: allCandidates.size,
      }).eq("id", jobId);
    }

    // ---------- Execute plan with bounded concurrency, no early break ----------
    const allCandidates = new Map<string, Candidate>();
    const errors: string[] = [];
    const passStats: Record<string, number> = {};
    const CONCURRENCY = 6;
    const HARD_CAP = 800; // ceiling on candidates per scan
    let rankCursor = 0;
    let planIdx = 0;
    let passesDone = 0;
    let lastPass = "starting";

    async function worker() {
      while (true) {
        const i = planIdx++;
        if (i >= plan.length) return;
        if (allCandidates.size >= HARD_CAP) return;
        const task = plan[i];
        lastPass = task.pass;
        try {
          const html = await firecrawlHtml(fcKey, task.url, task.url.includes("youtube.com") ? 3500 : 2000);
          const found = collectYouTubeCandidates(html, task.matchedKeyword, rankCursor);
          rankCursor += found.length;
          let added = 0;
          for (const c of found) {
            if (!allCandidates.has(c.videoId)) { allCandidates.set(c.videoId, c); added++; }
            if (allCandidates.size >= HARD_CAP) break;
          }
          passStats[task.pass] = (passStats[task.pass] ?? 0) + added;
        } catch (e: any) {
          errors.push(`${task.pass} [${task.matchedKeyword}]: ${e?.message || e}`);
        } finally {
          passesDone++;
          writeProgress().catch(() => {});
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    } catch (e: any) {
      await supabase.from("scan_jobs").update({
        status: "failed", error_message: String(e?.message ?? e),
        completed_at: new Date().toISOString(), passes_done: passesDone,
      }).eq("id", jobId);
      throw e;
    }

    const candidates = Array.from(allCandidates.values());

    // ---------- Incremental dedup against existing rows ----------
    const { data: existingRows } = await supabase
      .from("discovered_matches")
      .select("video_id")
      .eq("user_id", userId)
      .eq("asset_id", assetId)
      .eq("discovered_via", "youtube_firecrawl_ai_verified");
    const existing = new Set((existingRows ?? []).map((r: any) => r.video_id).filter(Boolean));

    const fresh = candidates.filter((c) => !existing.has(c.videoId));

    const rows = fresh.map((c) => {
      const textSignal = textSignalScore(c.title, c.channel, subject);
      const subjectInTitle = c.title.toLowerCase().includes(subject.toLowerCase());
      const keywordScore = subjectInTitle ? 100 : 40;
      const rankProxy = Math.max(30, 95 - c.rank * 0.5);
      const cls = categorizeFromTitle(c.title, c.channel);
      const preFinal = Math.min(
        69,
        Math.round(keywordScore * 0.3 + textSignal * 0.2 + rankProxy * 0.15),
      );
      const risk = preFinal >= 60 ? "possible" : "review";
      const resultCategory = resultCategoryFromSignals(c.title, c.channel, c.matchedKeyword);
      return {
        asset_id: assetId,
        user_id: userId,
        source_url: c.url, platform: "YouTube", domain: "youtube.com",
        preview_url: c.thumb,
        channel_name: c.channel, video_title: c.title, video_id: c.videoId,
        fair_use_flag: cls.fairUse, violation_category: cls.category,
        phash_score: 0, dhash_score: 0,
        clip_score: 0,
        metadata_score: textSignal,
        ai_score: 0,
        final_confidence_score: preFinal,
        risk_level: risk,
        match_type: c.isShort ? "youtube_short" : "youtube_video",
        status: "pending",
        discovered_via: "youtube_firecrawl_ai_verified",
        result_category: resultCategory,
        is_owned: false,
        notes: `KEYWORD:${c.matchedKeyword} | TYPE:${cls.risk} | NEW_DISCOVERY | Visual face verification pending — click Verify Face to confirm.`,
      };
    });

    let insertedCount = 0;
    if (rows.length) {
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { data: ins, error: insErr } = await supabase
          .from("discovered_matches").insert(slice).select("id");
        if (insErr) throw insErr;
        insertedCount += ins?.length ?? 0;
      }
    }

    await supabase.from("scan_jobs").update({
      status: candidates.length === 0 ? "completed_empty" : "completed",
      progress: 100, passes_done: plan.length,
      current_pass: "done",
      candidates_found: candidates.length,
      new_count: insertedCount,
      duplicates_skipped: candidates.length - fresh.length,
      completed_at: new Date().toISOString(),
      error_message: errors[0] ?? null,
    }).eq("id", jobId);

    // Update monitoring profile's last_scan_at
    await supabase.from("monitoring_profiles")
      .update({ last_scan_at: new Date().toISOString() })
      .eq("asset_id", assetId);

    if (candidates.length === 0) {
      return {
        job_id: jobId, inserted: 0, new_count: 0, total: 0, query: subject,
        passes_run: plan.length, pass_stats: passStats,
        note: `No YouTube results from ${plan.length} discovery passes for "${subject}". ${errors[0] ?? "YouTube/Google may be temporarily blocking the scrape."}`,
      };
    }

    return {
      job_id: jobId,
      inserted: insertedCount,
      new_count: insertedCount,
      total: existing.size + insertedCount,
      duplicates_skipped: candidates.length - fresh.length,
      candidates_found: candidates.length,
      query: subject,
      passes_run: plan.length,
      pass_stats: passStats,
      variants: keywordQueries.length,
      errors: errors.slice(0, 3),
    };
  });


// On-demand face/content verification for a single discovered match.
// Runs the Gemini multimodal comparison and updates the row in place.
export const verifyYouTubeMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: match } = await supabase.from("discovered_matches").select("*").eq("id", data.matchId).maybeSingle();
    if (!match || match.user_id !== userId) throw new Error("Match not found");
    if (!match.asset_id) throw new Error("This match has no reference asset. Re-run scan with a registered reference image.");

    const { data: asset } = await supabase.from("assets").select("*").eq("id", match.asset_id).maybeSingle();
    if (!asset || asset.asset_type !== "image" || !asset.storage_path)
      throw new Error("Reference asset is missing or not an image.");

    const { data: signed } = await supabase.storage.from("assets").createSignedUrl(asset.storage_path, 60 * 60);
    if (!signed?.signedUrl) throw new Error("Could not sign reference URL");

    const gateway = createLovableAiGatewayProvider(key);
    let v: z.infer<typeof VerificationSchema>;
    try {
      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({ schema: VerificationSchema }),
        temperature: 0, maxRetries: 1,
        messages: [{
          role: "user",
          content: [
            { type: "text", text:
              `Compare REGISTERED reference (image A) to YouTube thumbnail (image B).\n` +
              `Title: "${match.video_title}"\nChannel: "${match.channel_name}"\n` +
              `Return same_person_or_content=true only when face/content clearly matches. ` +
              `Then classify violation_category and fair_use_flag.` },
            { type: "file", data: new URL(signed.signedUrl), mediaType: "image" },
            { type: "file", data: new URL(String(match.preview_url ?? "")), mediaType: "image" },
          ],
        }],
      });
      v = r.output;
    } catch (e: any) {
      throw new Error(`AI verification failed: ${e?.message ?? e}`);
    }

    const visual = Math.round(v.visual_confidence);
    const textSignal = Number(match.metadata_score) || 0;
    const keywordScore = String(match.video_title).toLowerCase().includes(String(asset.title ?? "").toLowerCase()) ? 100 : 60;
    // Full formula: 30 keyword + 20 text + 15 thumb (use visual proxy/2) + 20 face + 15 frame (face/2)
    const final = Math.min(100, Math.round(
      keywordScore * 0.3 + textSignal * 0.2 + (visual * 0.5) * 0.15 + visual * 0.2 + (visual * 0.7) * 0.15,
    ));
    const risk = final >= 90 ? "confirmed" : final >= 70 ? "strong" : final >= 50 ? "possible" : "review";
    const category = v.same_person_or_content && v.violation_category !== "unrelated" ? v.violation_category : match.violation_category;
    const fairUse = v.same_person_or_content && v.fair_use_flag !== "not_applicable" ? v.fair_use_flag : match.fair_use_flag;

    const { data: updated, error: uErr } = await supabase
      .from("discovered_matches")
      .update({
        clip_score: visual, ai_score: visual,
        final_confidence_score: final, risk_level: risk,
        violation_category: category, fair_use_flag: fairUse,
        notes: `${match.notes}\nFACE VERIFY: ${v.same_person_or_content ? "MATCH" : "NO MATCH"} (${visual}%). ${v.reason}`,
      })
      .eq("id", match.id).select("*").maybeSingle();
    if (uErr) throw uErr;
    return { match: updated, verified: v.same_person_or_content, visual, final, risk };
  });
