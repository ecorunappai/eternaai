// GET /api/search?q=...&category=...&platform=...&freshness=...&limit=...
// Thin HTTP wrapper around src/lib/searxng.functions.ts so external callers
// (cron jobs, the Playwright worker, third-party integrations) can hit the
// same SearXNG-backed discovery layer the app uses internally.
import { createFileRoute } from "@tanstack/react-router";
import { searxngQuery, normalize, searxngConfig, type EternaResult } from "@/lib/searxng.functions";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim();
        if (!q) return Response.json({ ok: false, error: "Missing ?q" }, { status: 400 });

        const category = url.searchParams.get("category") ?? undefined;
        const platform = url.searchParams.get("platform") ?? undefined;
        const freshnessParam = url.searchParams.get("freshness") ?? "";
        const freshness = freshnessParam === "latest" ? "month" : (freshnessParam === "any" ? "" : freshnessParam);
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

        const { baseUrl, bearer } = searxngConfig();
        if (!baseUrl) {
          return Response.json(
            { ok: false, error: "SearXNG search engine is offline. Please start Docker service.", results: [] },
            { status: 503 },
          );
        }

        let query = q;
        let cat = category ?? undefined;
        if (platform && platform !== "all") {
          const siteMap: Record<string, string> = {
            youtube: "youtube.com", instagram: "instagram.com", facebook: "facebook.com",
            tiktok: "tiktok.com", x: "x.com", reddit: "reddit.com",
          };
          const site = siteMap[platform];
          if (site) query = `site:${site} ${query}`;
          if (platform === "news") cat = "news";
        }

        try {
          const raws = await searxngQuery(baseUrl, query, {
            categories: cat, timeRange: (freshness as any) || undefined, bearer,
          });
          const results: EternaResult[] = raws
            .map((r) => normalize(r, { subject: q, keywords: [q] }))
            .filter((r): r is EternaResult => !!r)
            .slice(0, limit);
          return Response.json({ ok: true, query, count: results.length, results });
        } catch (e) {
          return Response.json(
            { ok: false, error: `SearXNG offline: ${(e as Error).message}`, results: [] },
            { status: 503 },
          );
        }
      },
    },
  },
});
