// Generic multi-query, multi-platform web-search runner.
// Uses Google Search (SPA-safe, no login) to collect result URLs + titles +
// snippets across YouTube, Instagram, TikTok, Facebook, Reddit, News and the
// open web. Captures a screenshot per SERP + per opened result. Public pages
// only; consent banners handled; no login-wall bypass.
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted, getTask } from "../store.js";
import { guardPublicPage } from "../guards.js";
import { handleConsent } from "../consent.js";
import { snapshot, snapshotError } from "../screenshot.js";

const NAV_TIMEOUT = 120_000;
const SETTLE_MS = 6_000;

interface Hit {
  title: string;
  url: string;
  snippet: string;
  platform: string;
  query: string;
  reason: string;
  screenshot?: string;
  ts: string;
}

function platformFor(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("news.google") || /\/news\//.test(u)) return "news";
  return "web";
}

function buildQueries(input: any): string[] {
  const explicit: string[] = Array.isArray(input.queries) ? input.queries.filter(Boolean) : [];
  if (explicit.length) return explicit.slice(0, 20);
  const name: string = String(input.name || input.creatorName || input.query || "").trim();
  const username: string = String(input.username || "").trim();
  const kws: string[] = Array.isArray(input.keywords) ? input.keywords : [];
  const q: string[] = [];
  if (name) {
    q.push(`"${name}"`);
    for (const suffix of ["fake", "troll", "reaction", "leaked", "scam", "impersonation", "reupload", "expose"]) {
      q.push(`"${name}" ${suffix}`);
    }
    q.push(`site:youtube.com "${name}"`);
    q.push(`site:reddit.com "${name}"`);
    q.push(`site:tiktok.com "${name}"`);
  }
  if (username) {
    q.push(`"${username}"`);
    q.push(`site:instagram.com ${username}`);
    q.push(`site:tiktok.com ${username}`);
    q.push(`site:facebook.com ${username}`);
  }
  for (const k of kws.slice(0, 5)) if (name) q.push(`"${name}" ${k}`);
  return Array.from(new Set(q)).slice(0, 20);
}

async function collectSerp(page: any, query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=20`;
  await page.goto(url, { waitUntil: "commit", timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(2500);
  await handleConsent(page, url).catch(() => {});
  await page.waitForTimeout(1500);
  const guard = await guardPublicPage(page);
  if (!guard.ok) return [];
  return page.evaluate(() => {
    const out: Array<{ title: string; url: string; snippet: string }> = [];
    const seen = new Set<string>();
    document.querySelectorAll("a[href^='http'], a[href^='/url?']").forEach((el) => {
      const a = el as HTMLAnchorElement;
      let href = a.href;
      if (href.startsWith("https://www.google.com/url?") || href.includes("/url?")) {
        try { href = new URL(href).searchParams.get("q") || href; } catch {}
      }
      if (!/^https?:\/\//.test(href)) return;
      if (/google\.com|gstatic|googleusercontent|youtube\.com\/redirect/.test(href)) return;
      if (seen.has(href)) return;
      seen.add(href);
      const h3 = a.querySelector("h3");
      const title = (h3?.textContent || a.textContent || "").trim();
      if (!title || title.length < 4) return;
      let container: Element | null = a;
      for (let i = 0; i < 4 && container; i++) container = container.parentElement;
      const snippet = (container?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
      out.push({ title, url: href, snippet });
    });
    return out.slice(0, 15);
  }).catch(() => []);
}

export async function runWebSearch(ctx: RunCtx, input: any) {
  const { browser, taskId, evidenceDir, publicBaseUrl } = ctx;
  const queries = buildQueries(input);
  const openLimit = Math.max(1, Math.min(Number(input.openLimit ?? 5), 12));
  const platformFilter: string[] | null =
    Array.isArray(input.platforms) && input.platforms.length ? input.platforms.map(String) : null;

  const ctxPage = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxPage.newPage();
  const hits: Hit[] = [];
  const evidence: Hit[] = [];

  try {
    patchTask(taskId, { status: "navigating", nextAction: `Multi-platform search (${queries.length} queries)` });
    appendStep(taskId, { phase: "init", note: `Queries: ${queries.slice(0, 6).join(" | ")}${queries.length > 6 ? " …" : ""}` });

    for (const q of queries) {
      if (getTask(taskId)?.status === "cancelled") return;
      patchTask(taskId, { status: "navigating", nextAction: `Search: ${q}` });
      const serp = await collectSerp(page, q);
      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, `serp_${hits.length}`);
      appendStep(taskId, { phase: "navigating", url: page.url(), note: `SERP for "${q}" — ${serp.length} results`, screenshot: shot });
      for (const r of serp) {
        const plat = platformFor(r.url);
        if (platformFilter && !platformFilter.includes(plat)) continue;
        if (hits.find((h) => h.url === r.url)) continue;
        hits.push({
          title: r.title, url: r.url, snippet: r.snippet,
          platform: plat, query: q,
          reason: `Matched "${q}"`,
          ts: new Date().toISOString(),
        });
      }
      setExtracted(taskId, { hits, queriesRun: queries.slice(0, queries.indexOf(q) + 1) });
    }

    // Open the top N (prioritise social platforms) to capture evidence
    const priority = ["youtube", "instagram", "tiktok", "facebook", "reddit", "twitter", "news", "web"];
    const ordered = [...hits].sort((a, b) => priority.indexOf(a.platform) - priority.indexOf(b.platform));
    const toOpen = ordered.slice(0, openLimit);

    for (const h of toOpen) {
      if (getTask(taskId)?.status === "cancelled") return;
      patchTask(taskId, { status: "extracting", nextAction: `Open ${h.platform}: ${h.title.slice(0, 60)}` });
      const ok = await page.goto(h.url, { waitUntil: "commit", timeout: NAV_TIMEOUT }).then(() => true).catch(() => false);
      if (!ok) { appendStep(taskId, { phase: "guard", url: h.url, note: `Navigation failed: ${h.url}` }); continue; }
      await page.waitForTimeout(SETTLE_MS);
      await handleConsent(page, h.url).catch(() => {});
      const guard = await guardPublicPage(page);
      if (!guard.ok) { appendStep(taskId, { phase: "guard", url: h.url, note: guard.reason }); continue; }
      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, `hit_${evidence.length + 1}_${h.platform}`);
      const pageTitle = await page.title().catch(() => h.title);
      evidence.push({ ...h, title: pageTitle || h.title, screenshot: shot });
      appendStep(taskId, {
        phase: "evidence_captured",
        url: h.url,
        note: `${h.platform.toUpperCase()} — ${pageTitle || h.title}`,
        screenshot: shot,
      });
      setExtracted(taskId, { hits, evidence });
    }

    setExtracted(taskId, { hits, evidence, queriesRun: queries, platformCounts: countPlatforms(hits) });
    appendStep(taskId, {
      phase: "completed",
      note: `Web search complete — ${hits.length} results, ${evidence.length} captured`,
    }, "completed");
  } catch (err) {
    await snapshotError(page, taskId, evidenceDir, publicBaseUrl, (err as Error).message).catch(() => {});
    throw err;
  } finally {
    await ctxPage.close().catch(() => {});
  }
}

function countPlatforms(hits: Hit[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const h of hits) c[h.platform] = (c[h.platform] ?? 0) + 1;
  return c;
}
