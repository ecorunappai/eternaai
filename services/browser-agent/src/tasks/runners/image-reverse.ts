// Reverse image search runner — Google Lens → Bing Visual Search → Yandex Images.
// Public pages only, consent-safe, partial success supported.
// Input: { imageUrl: string, assetId?: string, assetName?: string, providers?: string[] }
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted, getTask } from "../store.js";
import { handleConsent } from "../consent.js";
import { snapshot, snapshotError } from "../screenshot.js";

const NAV_TIMEOUT = 120_000;
const SETTLE_MS = 6_000;

interface ImageHit {
  provider: "google_lens" | "bing_visual" | "yandex_images";
  url: string;
  title: string;
  thumb: string | null;
  host: string;
  confidence: number;
  firstSeenAt: string;
  screenshot?: string;
}

interface ProviderResult {
  provider: string;
  ok: boolean;
  hits: ImageHit[];
  screenshot?: string;
  error?: string;
}

const EXCLUDED = /google\.|gstatic|googleusercontent|schema\.org|w3\.org|bing\.com|microsoft\.com|yandex\.|yastatic/i;

function safeHost(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function normalizeExternalLink(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    // Unwrap Google/Yandex/Bing redirect wrappers.
    const q = u.searchParams;
    for (const k of ["url", "u", "imgrefurl", "mediaurl", "rurl", "q"]) {
      const v = q.get(k);
      if (v && /^https?:/i.test(v)) return v;
    }
    if (!/^https?:$/.test(u.protocol)) return null;
    if (EXCLUDED.test(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
}

async function runGoogleLens(page: any, imageUrl: string): Promise<Pick<ProviderResult, "hits" | "ok" | "error">> {
  const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
  try {
    await page.goto(lensUrl, { waitUntil: "commit", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);
    await handleConsent(page, lensUrl).catch(() => {});
    await page.waitForTimeout(2500);
    const raw = await page.evaluate((base: string) => {
      const out: Array<{ url: string; title: string; thumb: string | null }> = [];
      document.querySelectorAll("a[href]").forEach((el) => {
        const a = el as HTMLAnchorElement;
        const href = a.getAttribute("href") || "";
        if (!href) return;
        const img = a.querySelector("img");
        const title = (a.getAttribute("aria-label") || a.textContent || img?.getAttribute("alt") || "").trim();
        out.push({ url: href, title: title.slice(0, 160), thumb: img?.getAttribute("src") || null });
      });
      return { out, base };
    }, lensUrl).catch(() => ({ out: [], base: lensUrl }));
    const seen = new Set<string>();
    const hits: ImageHit[] = [];
    let rank = 0;
    for (const r of raw.out) {
      const abs = normalizeExternalLink(r.url, lensUrl);
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      hits.push({
        provider: "google_lens",
        url: abs,
        title: r.title || safeHost(abs),
        thumb: r.thumb,
        host: safeHost(abs),
        confidence: Math.max(45, 92 - rank * 4),
        firstSeenAt: new Date().toISOString(),
      });
      rank++;
      if (hits.length >= 12) break;
    }
    return { hits, ok: true };
  } catch (e) {
    return { hits: [], ok: false, error: (e as Error).message };
  }
}

async function runBingVisual(page: any, imageUrl: string): Promise<Pick<ProviderResult, "hits" | "ok" | "error">> {
  const url = `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:${encodeURIComponent(imageUrl)}`;
  try {
    await page.goto(url, { waitUntil: "commit", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);
    await handleConsent(page, url).catch(() => {});
    await page.waitForTimeout(2500);
    const raw = await page.evaluate(() => {
      const out: Array<{ url: string; title: string; thumb: string | null }> = [];
      document.querySelectorAll("a.iusc, a[href*='mediaurl='], a[m]").forEach((el) => {
        const a = el as HTMLAnchorElement;
        let target = a.getAttribute("href") || "";
        const meta = a.getAttribute("m");
        if (meta) {
          try {
            const j = JSON.parse(meta);
            if (j?.purl) target = j.purl;
          } catch { /* noop */ }
        }
        const img = a.querySelector("img");
        const title = (a.getAttribute("title") || img?.getAttribute("alt") || "").trim();
        out.push({ url: target, title: title.slice(0, 160), thumb: img?.getAttribute("src") || null });
      });
      return out;
    }).catch(() => [] as any[]);
    const seen = new Set<string>();
    const hits: ImageHit[] = [];
    let rank = 0;
    for (const r of raw) {
      const abs = normalizeExternalLink(r.url, url);
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      hits.push({
        provider: "bing_visual",
        url: abs,
        title: r.title || safeHost(abs),
        thumb: r.thumb,
        host: safeHost(abs),
        confidence: Math.max(45, 88 - rank * 4),
        firstSeenAt: new Date().toISOString(),
      });
      rank++;
      if (hits.length >= 12) break;
    }
    return { hits, ok: true };
  } catch (e) {
    return { hits: [], ok: false, error: (e as Error).message };
  }
}

async function runYandexImages(page: any, imageUrl: string): Promise<Pick<ProviderResult, "hits" | "ok" | "error">> {
  const url = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`;
  try {
    await page.goto(url, { waitUntil: "commit", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);
    await handleConsent(page, url).catch(() => {});
    await page.waitForTimeout(2500);
    const raw = await page.evaluate(() => {
      const out: Array<{ url: string; title: string; thumb: string | null }> = [];
      document.querySelectorAll("a.CbirSites-ItemTitle, a.Link.CbirSites-ItemTitle, li.CbirSites-Item a, a.serp-item__link").forEach((el) => {
        const a = el as HTMLAnchorElement;
        const href = a.getAttribute("href") || "";
        const title = (a.textContent || a.getAttribute("title") || "").trim();
        const img = a.querySelector("img");
        out.push({ url: href, title: title.slice(0, 160), thumb: img?.getAttribute("src") || null });
      });
      return out;
    }).catch(() => [] as any[]);
    const seen = new Set<string>();
    const hits: ImageHit[] = [];
    let rank = 0;
    for (const r of raw) {
      const abs = normalizeExternalLink(r.url, url);
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      hits.push({
        provider: "yandex_images",
        url: abs,
        title: r.title || safeHost(abs),
        thumb: r.thumb,
        host: safeHost(abs),
        confidence: Math.max(45, 86 - rank * 4),
        firstSeenAt: new Date().toISOString(),
      });
      rank++;
      if (hits.length >= 12) break;
    }
    return { hits, ok: true };
  } catch (e) {
    return { hits: [], ok: false, error: (e as Error).message };
  }
}

export async function runImageReverse(ctx: RunCtx, input: any) {
  const { browser, taskId, evidenceDir, publicBaseUrl } = ctx;
  const imageUrl: string = String(input?.imageUrl || "").trim();
  if (!imageUrl) throw new Error("imageUrl is required");
  const providers: string[] = Array.isArray(input?.providers) && input.providers.length
    ? input.providers.map(String)
    : ["google_lens", "bing_visual", "yandex_images"];

  const ctxPage = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxPage.newPage();
  const results: ProviderResult[] = [];
  const allHits: ImageHit[] = [];

  try {
    patchTask(taskId, { status: "navigating", nextAction: `Reverse image search (${providers.join(" → ")})` });
    appendStep(taskId, { phase: "init", note: `Providers: ${providers.join(", ")}` });

    for (const provider of providers) {
      if (getTask(taskId)?.status === "cancelled") return;
      patchTask(taskId, { status: "navigating", nextAction: `Provider: ${provider}` });
      let r: Pick<ProviderResult, "hits" | "ok" | "error">;
      if (provider === "google_lens") r = await runGoogleLens(page, imageUrl);
      else if (provider === "bing_visual") r = await runBingVisual(page, imageUrl);
      else if (provider === "yandex_images") r = await runYandexImages(page, imageUrl);
      else { r = { hits: [], ok: false, error: `Unknown provider: ${provider}` }; }

      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, `${provider}_serp`);
      const entry: ProviderResult = { provider, ok: r.ok, hits: r.hits, screenshot: shot, error: r.error };
      // attach the SERP screenshot to each hit (evidence)
      for (const h of r.hits) h.screenshot = shot;
      results.push(entry);
      allHits.push(...r.hits);

      appendStep(taskId, {
        phase: r.ok ? "extracting" : "guard",
        url: page.url(),
        note: r.ok
          ? `${provider}: ${r.hits.length} matches captured`
          : `${provider} failed: ${r.error ?? "unknown"} — continuing with remaining providers`,
        screenshot: shot,
      });
      setExtracted(taskId, { hits: allHits, results });
    }

    const successful = results.filter((r) => r.ok).length;
    const partial = successful > 0 && successful < results.length;
    setExtracted(taskId, {
      hits: allHits,
      results,
      partial,
      providersOk: results.filter((r) => r.ok).map((r) => r.provider),
      providersFailed: results.filter((r) => !r.ok).map((r) => r.provider),
    });
    appendStep(taskId, {
      phase: "completed",
      note: `Reverse image search complete — ${allHits.length} matches across ${successful}/${results.length} providers${partial ? " (partial)" : ""}`,
    }, "completed");
  } catch (err) {
    await snapshotError(page, taskId, evidenceDir, publicBaseUrl, (err as Error).message).catch(() => {});
    throw err;
  } finally {
    await ctxPage.close().catch(() => {});
  }
}
