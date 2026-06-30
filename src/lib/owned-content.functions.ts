// Official / Owned Content layer for Eterna AI.
// - Lets users register their official channels/profiles (auto-detected or manual).
// - Pulls the creator's own YouTube videos into a reference library.
// - Classifies discovered_matches against owned accounts so verified creators
//   are NEVER flagged as infringers, and original videos are linked to reposts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PLATFORMS = ["youtube", "instagram", "facebook", "x", "tiktok", "website"] as const;

const AddInput = z.object({
  platform: z.enum(PLATFORMS),
  display_name: z.string().min(1).max(120),
  url: z.string().url(),
  handle: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const RemoveInput = z.object({ id: z.string().uuid() });
const SyncInput = z.object({ owned_account_id: z.string().uuid() });
const ClassifyInput = z.object({ subject: z.string().min(1).max(200).optional() });
const AutodetectInput = z.object({ name: z.string().min(2).max(120) });

function decodeHtml(v: string): string {
  return v.replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function firecrawlHtml(apiKey: string, url: string, waitFor = 3500): Promise<string> {
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

// ---------- CRUD ----------
export const addOwnedAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Try to extract YouTube channel ID from URL for later matching.
    let channel_id: string | null = null;
    if (data.platform === "youtube") {
      const m = /\/(channel|c|user)\/([A-Za-z0-9_-]+)|\/@([A-Za-z0-9._-]+)/.exec(data.url);
      channel_id = m?.[2] ?? null;
    }
    const { data: row, error } = await supabase
      .from("owned_accounts")
      .insert({
        user_id: userId,
        platform: data.platform,
        display_name: data.display_name,
        handle: data.handle ?? null,
        url: data.url,
        channel_id,
        is_verified: false,
        verification_source: "manual",
        notes: data.notes ?? null,
      })
      .select("*").maybeSingle();
    if (error) throw error;
    return { account: row };
  });

export const removeOwnedAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("owned_accounts").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Auto-detect official channels for a subject ----------
export const autodetectOfficialAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AutodetectInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("Firecrawl is not connected.");
    const name = data.name.trim();
    const candidates: Array<{ platform: string; url: string; display_name: string; handle?: string; verified?: boolean }> = [];

    // YouTube: search channels and pick top hit + verified badge detection.
    try {
      const html = await firecrawlHtml(apiKey, `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}&sp=EgIQAg%253D%253D`, 3500);
      const channelRe = /"channelRenderer":\{"channelId":"(UC[A-Za-z0-9_-]{22})"[^]*?"title":\{"simpleText":"([^"]+)"[^]*?(?:"subscriberCountText":\{"simpleText":"([^"]+)")?/g;
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = channelRe.exec(html)) !== null && count < 3) {
        const id = m[1], title = decodeHtml(m[2]);
        const tail = html.slice(m.index, m.index + 5000);
        const verified = /"BADGE_STYLE_TYPE_VERIFIED/.test(tail) || /"BADGE_STYLE_TYPE_VERIFIED_ARTIST/.test(tail);
        candidates.push({ platform: "youtube", url: `https://www.youtube.com/channel/${id}`, display_name: title, handle: id, verified });
        count++;
      }
    } catch { /* noop */ }

    // Instagram / X / Facebook / TikTok / Wikipedia / Website — Google site-search each.
    const sitemap: Array<{ platform: string; q: string; host: string }> = [
      { platform: "instagram", q: `site:instagram.com "${name}"`, host: "instagram.com" },
      { platform: "x", q: `site:x.com OR site:twitter.com "${name}"`, host: "x.com" },
      { platform: "facebook", q: `site:facebook.com "${name}"`, host: "facebook.com" },
      { platform: "tiktok", q: `site:tiktok.com "${name}"`, host: "tiktok.com" },
    ];
    for (const s of sitemap) {
      try {
        const html = await firecrawlHtml(apiKey, `https://duckduckgo.com/html/?q=${encodeURIComponent(s.q)}`, 2500);
        const re = new RegExp(`https?://(?:www\\.)?${s.host.replace(/\./g, "\\.")}/[A-Za-z0-9._%/?=&-]+`, "g");
        const found = (html.match(re) ?? []).slice(0, 1);
        for (const url of found) candidates.push({ platform: s.platform, url, display_name: name });
      } catch { /* noop */ }
    }
    return { candidates };
  });

// ---------- Sync original videos for a YouTube owned account ----------
export const syncOriginalVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("Firecrawl is not connected.");
    const { data: acct } = await supabase.from("owned_accounts").select("*").eq("id", data.owned_account_id).maybeSingle();
    if (!acct || acct.user_id !== userId) throw new Error("Account not found");
    if (acct.platform !== "youtube") throw new Error("Original video sync supports YouTube only.");

    const videosUrl = acct.url.replace(/\/$/, "") + "/videos";
    const html = await firecrawlHtml(apiKey, videosUrl, 4500);

    const re = /"videoId":"([A-Za-z0-9_-]{11})"[^]*?"title":\{(?:"runs":\[\{"text":"([^"]+)"|"simpleText":"([^"]+)")/g;
    const found = new Map<string, { id: string; title: string }>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const id = m[1]; if (found.has(id)) continue;
      const title = decodeHtml(m[2] ?? m[3] ?? "");
      if (title) found.set(id, { id, title });
      if (found.size >= 80) break;
    }
    if (found.size === 0) return { inserted: 0, note: "YouTube returned no video list (channel may be empty or rate-limited)." };

    const rows = Array.from(found.values()).map((v) => ({
      user_id: userId,
      owned_account_id: acct.id,
      video_id: v.id,
      title: v.title,
      thumbnail_url: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      channel_name: acct.display_name,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }));
    const { data: inserted, error } = await supabase
      .from("original_videos")
      .upsert(rows, { onConflict: "user_id,video_id", ignoreDuplicates: false })
      .select("id");
    if (error) throw error;
    return { inserted: inserted?.length ?? rows.length };
  });

// ---------- Classify existing discovered_matches against owned + categories ----------
export const classifyMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClassifyInput.parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: owned }, { data: originals }, { data: matches }] = await Promise.all([
      supabase.from("owned_accounts").select("*").eq("user_id", userId),
      supabase.from("original_videos").select("id,video_id,title").eq("user_id", userId),
      supabase.from("discovered_matches").select("id,channel_name,video_title,video_id,source_url,notes").eq("user_id", userId).eq("discovered_via", "youtube_firecrawl_ai_verified"),
    ]);

    const ownedChannelNames = new Set((owned ?? []).filter(o => o.platform === "youtube").map(o => (o.display_name ?? "").toLowerCase().trim()));
    const ownedHandles = new Set((owned ?? []).filter(o => o.platform === "youtube").map(o => (o.handle ?? "").toLowerCase().trim()).filter(Boolean));
    const originalIdByVideoId = new Map((originals ?? []).map(o => [o.video_id, o.id] as const));

    const updates: Array<{ id: string; result_category: string; is_owned: boolean; original_video_id: string | null }> = [];
    for (const m of matches ?? []) {
      const chan = (m.channel_name ?? "").toLowerCase().trim();
      const url = String(m.source_url ?? "").toLowerCase();
      const isOwned = ownedChannelNames.has(chan) ||
        Array.from(ownedHandles).some(h => h && (chan.includes(h) || url.includes(h.replace(/^@/, ""))));
      const linkedOriginal = m.video_id ? (originalIdByVideoId.get(m.video_id) ?? null) : null;

      const title = `${m.video_title ?? ""} ${chan} ${m.notes ?? ""}`.toLowerCase();
      let category = "unknown";
      if (isOwned || linkedOriginal) category = "official";
      else if (/\b(reaction|reacts|reacting)\b|റിയാക്ഷൻ/.test(title)) category = "reaction";
      else if (/\b(troll|roast|meme)\b|ട്രോൾ/.test(title)) category = "troll";
      else if (/\b(news|commentary|review|വാർത്ത|latest issue|issue|controversy|exposed|scandal)\b/.test(title)) category = "news";
      else if (/\b(full video|reupload|repost|original|leaked|without permission)\b/.test(title)) category = "reupload";
      else if (/\b(fan ?page|fans|fanclub|tribute|status|edit|ഫാൻസ്)\b/.test(title)) category = "fan";
      else if (/\b(fake|impersonat|deepfake)\b/.test(title)) category = "impersonation";
      else category = "needs_review";

      updates.push({ id: m.id, result_category: category, is_owned: !!isOwned, original_video_id: linkedOriginal });
    }

    let touched = 0;
    for (const u of updates) {
      const { error } = await supabase
        .from("discovered_matches")
        .update({ result_category: u.result_category, is_owned: u.is_owned, original_video_id: u.original_video_id })
        .eq("id", u.id).eq("user_id", userId);
      if (!error) touched++;
    }
    return { classified: touched, total: updates.length };
  });
