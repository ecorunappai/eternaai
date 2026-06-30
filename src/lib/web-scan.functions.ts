// Eterna AI — Multi-platform web discovery scan.
// Searches Instagram, TikTok, Twitter/X, Reddit, Facebook, Pinterest, news + general web
// for content related to a registered asset's creator/brand and keywords using Firecrawl Search.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  assetId: z.string().uuid(),
  query: z.string().min(1).optional(),
});

type PlatformDef = { id: string; label: string; site?: string; query?: (subject: string) => string };

const PLATFORMS: PlatformDef[] = [
  { id: "instagram", label: "Instagram", site: "instagram.com" },
  { id: "youtube", label: "YouTube", site: "youtube.com" },
  { id: "tiktok", label: "TikTok", site: "tiktok.com" },
  { id: "twitter", label: "Twitter/X", site: "twitter.com" },
  { id: "x", label: "Twitter/X", site: "x.com" },
  { id: "reddit", label: "Reddit", site: "reddit.com" },
  { id: "facebook", label: "Facebook", site: "facebook.com" },
  { id: "pinterest", label: "Pinterest", site: "pinterest.com" },
  { id: "threads", label: "Threads", site: "threads.net" },
  { id: "tumblr", label: "Tumblr", site: "tumblr.com" },
  { id: "telegram", label: "Telegram", site: "t.me" },
  { id: "news", label: "News / Web" }, // no site filter
];

function platformFromHost(host: string): string {
  const h = host.toLowerCase();
  if (h.includes("instagram")) return "Instagram";
  if (h.includes("youtube") || h.includes("youtu.be")) return "YouTube";
  if (h.includes("tiktok")) return "TikTok";
  if (h.includes("twitter") || h === "x.com" || h.endsWith(".x.com")) return "Twitter/X";
  if (h.includes("reddit")) return "Reddit";
  if (h.includes("facebook") || h.endsWith("fb.com")) return "Facebook";
  if (h.includes("pinterest") || h === "pin.it") return "Pinterest";
  if (h.includes("threads.net")) return "Threads";
  if (h.includes("tumblr")) return "Tumblr";
  if (h === "t.me" || h.endsWith(".t.me")) return "Telegram";
  return h.replace(/^www\./, "").split(".")[0].replace(/^./, (c) => c.toUpperCase());
}

async function firecrawlSearch(apiKey: string, query: string, limit = 10): Promise<any[]> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit, timeout: 22000 }),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const arr = json?.data?.web ?? json?.data ?? json?.web ?? [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export const runWebScanEverywhere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("Firecrawl is not connected. Link the Firecrawl connector and retry.");

    const { data: asset } = await supabase.from("assets")
      .select("id,user_id,title").eq("id", data.assetId).maybeSingle();
    if (!asset || asset.user_id !== userId) throw new Error("Asset not found");

    const { data: profile } = await supabase.from("monitoring_profiles")
      .select("creator_name,brand_name,aliases,regional_name,keywords")
      .eq("asset_id", asset.id).maybeSingle();

    const subject = (data.query?.trim()
      || profile?.creator_name
      || profile?.brand_name
      || asset.title
      || "").trim();
    if (!subject) throw new Error("No creator/brand name to search. Set up monitoring first.");

    const aliases = (profile?.aliases ?? []) as string[];
    const regional = profile?.regional_name ? [profile.regional_name as string] : [];
    const subjects = Array.from(new Set([subject, ...aliases, ...regional].map(s => s.trim()).filter(Boolean)));

    const baseKeywords = (profile?.keywords ?? []) as string[];
    const keywords = baseKeywords.length ? baseKeywords.slice(0, 6) : [""];

    // Build query plan — per platform × per subject × a few keywords.
    type Task = { platform: PlatformDef; q: string };
    const plan: Task[] = [];
    for (const p of PLATFORMS) {
      for (const s of subjects) {
        // Always one base query per platform/subject
        plan.push({ platform: p, q: p.site ? `site:${p.site} "${s}"` : `"${s}"` });
        // A few keyword-amplified queries
        for (const kw of keywords.slice(0, 3)) {
          if (!kw) continue;
          plan.push({ platform: p, q: p.site ? `site:${p.site} "${s}" ${kw}` : `"${s}" ${kw}` });
        }
      }
    }

    // Run with bounded concurrency to avoid rate limits.
    const CONCURRENCY = 4;
    type Row = {
      url: string; title?: string; description?: string; host: string; platform: string; preview?: string | null;
    };
    const collected: Row[] = [];
    let cursor = 0;
    async function worker() {
      while (cursor < plan.length) {
        const i = cursor++;
        const task = plan[i];
        const results = await firecrawlSearch(apiKey as string, task.q, 10);
        for (const r of results) {
          const url: string | undefined = r?.url || r?.link;
          if (!url) continue;
          try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            // Skip search engine + utility results
            if (/(^|\.)google\./.test(host) || host.endsWith("bing.com") || host.endsWith("duckduckgo.com")) continue;
            // If platform had a site filter, enforce host containment to keep buckets clean
            if (task.platform.site && !host.includes(task.platform.site)) {
              // News bucket has no site, still accept; for site-restricted tasks, drop off-site results.
              continue;
            }
            collected.push({
              url,
              title: r?.title || r?.metadata?.title,
              description: r?.description || r?.snippet || r?.metadata?.description,
              host,
              platform: task.platform.site ? task.platform.label : platformFromHost(host),
              preview: r?.metadata?.ogImage || r?.metadata?.image || r?.image || null,
            });
          } catch {/* skip */}
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Dedupe by normalized URL (origin + pathname).
    const seen = new Set<string>();
    const unique: Row[] = [];
    for (const r of collected) {
      try {
        const u = new URL(r.url);
        const key = `${u.origin}${u.pathname}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(r);
      } catch {/* skip */}
    }

    if (unique.length === 0) {
      return { inserted: 0, total: 0, new_count: 0, platforms: [], note: "No results found across the searched platforms." };
    }

    // Filter out URLs already in discovered_matches for this asset.
    const urls = unique.map(r => r.url);
    const { data: existingRows } = await supabase.from("discovered_matches")
      .select("source_url").eq("asset_id", asset.id).in("source_url", urls);
    const existing = new Set((existingRows ?? []).map((r: any) => r.source_url));

    const fresh = unique.filter(r => !existing.has(r.url));

    const rows = fresh.map((r) => {
      const conf = 55; // heuristic: keyword/site match without visual verification
      return {
        asset_id: asset.id,
        user_id: userId,
        source_url: r.url,
        platform: r.platform,
        domain: r.host,
        preview_url: r.preview ?? null,
        ai_score: null,
        final_confidence_score: conf,
        risk_level: "review",
        match_type: "keyword_web_match",
        status: "pending",
        discovered_via: "web_search_everywhere",
        notes: (r.title || r.description || "").slice(0, 280),
        video_title: r.title?.slice(0, 280) ?? null,
      };
    });

    let insertedCount = 0;
    if (rows.length) {
      const { data: ins, error } = await supabase.from("discovered_matches").insert(rows).select("id");
      if (error) throw error;
      insertedCount = ins?.length ?? 0;
    }

    const byPlatform: Record<string, number> = {};
    for (const r of unique) byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;

    return {
      inserted: insertedCount,
      new_count: insertedCount,
      total: unique.length,
      platforms: Object.entries(byPlatform).map(([name, count]) => ({ name, count })),
      passes_run: plan.length,
    };
  });
