// YouTube investigation runner — search creator, open videos, open channel,
// open About, extract links + public email/contact, screenshots all the way.
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted } from "../store.js";
import { guardPublicPage } from "../guards.js";
import { snapshot } from "../screenshot.js";

export async function runYouTube(ctx: RunCtx, input: any) {
  const { browser, taskId, evidenceDir, publicBaseUrl } = ctx;
  const ctxPage = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctxPage.newPage();
  const links: string[] = [];
  const videosSeen: { title: string; url: string }[] = [];
  let channelUrl: string | undefined = input.channelUrl;

  try {
    // 1. Search creator if no channelUrl given
    if (!channelUrl && input.query) {
      const q = encodeURIComponent(String(input.query));
      patchTask(taskId, { status: "navigating", nextAction: `Search: ${input.query}` });
      await page.goto(`https://www.youtube.com/results?search_query=${q}`, { waitUntil: "networkidle", timeout: 120000 });
      const guard = await guardPublicPage(page);
      if (!guard.ok) throw new Error(guard.reason);
      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, "search_results");
      appendStep(taskId, { phase: "navigating", url: page.url(), note: `Searched for "${input.query}"`, screenshot: shot });

      // Grab first channel link
      const firstChannel = await page.locator('a[href*="/channel/"], a[href*="/@"]').first().getAttribute("href").catch(() => null);
      if (firstChannel) channelUrl = new URL(firstChannel, "https://www.youtube.com").toString();
    }

    // 2. Open first video result(s)
    const videoLinks = await page.locator('a#video-title, a[href*="/watch?v="]').evaluateAll((els) =>
      els.slice(0, 3).map((e) => ({ url: (e as HTMLAnchorElement).href, title: (e as HTMLAnchorElement).innerText })),
    ).catch(() => []);
    for (const v of videoLinks.slice(0, 2)) {
      if (!v.url) continue;
      patchTask(taskId, { status: "navigating", nextAction: `Open video: ${v.title || v.url}` });
      await page.goto(v.url, { waitUntil: "networkidle", timeout: 120000 });
      const guard = await guardPublicPage(page);
      if (!guard.ok) { appendStep(taskId, { phase: "guard", url: page.url(), note: guard.reason }); continue; }
      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, `video_${videosSeen.length + 1}`);
      videosSeen.push({ title: v.title || (await page.title()), url: v.url });
      appendStep(taskId, { phase: "evidence_captured", url: v.url, note: `Captured video: ${v.title}`, screenshot: shot });
    }

    // 3. Open channel
    if (channelUrl) {
      patchTask(taskId, { status: "navigating", nextAction: "Open channel" });
      await page.goto(channelUrl, { waitUntil: "networkidle", timeout: 120000 });
      const guard = await guardPublicPage(page);
      if (!guard.ok) throw new Error(guard.reason);
      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, "channel");
      appendStep(taskId, { phase: "evidence_captured", url: page.url(), note: "Channel page captured", screenshot: shot });

      // 4. About tab
      const aboutUrl = channelUrl.replace(/\/$/, "") + "/about";
      patchTask(taskId, { status: "extracting", nextAction: "Open About page" });
      await page.goto(aboutUrl, { waitUntil: "networkidle", timeout: 120000 });
      const aboutShot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, "about");
      appendStep(taskId, { phase: "extracting", url: aboutUrl, note: "About page captured", screenshot: aboutShot });

      // Extract links and emails from the about content
      const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
      const hrefs = await page.locator('a[href^="http"]').evaluateAll((els) =>
        Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).href))),
      ).catch(() => []);
      const external = hrefs.filter((h: string) =>
        !/youtube\.com|youtu\.be|google\.com|googleusercontent/.test(h),
      ).slice(0, 30);
      links.push(...external);
      const emails = Array.from(new Set(bodyText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []));

      setExtracted(taskId, { channelUrl, externalLinks: external, emails, videos: videosSeen, bio: bodyText.slice(0, 1000) });
      if (emails.length) {
        patchTask(taskId, { status: "contact_found", nextAction: "Contact email discovered" });
        appendStep(taskId, { phase: "contact_found", note: `Found ${emails.length} email(s)` });
      }
    }

    appendStep(taskId, { phase: "completed", note: "YouTube investigation complete" }, "completed");
  } finally {
    await ctxPage.close().catch(() => {});
  }
}
