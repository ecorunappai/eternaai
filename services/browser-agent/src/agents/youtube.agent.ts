// YouTube public-page investigator. No login, no private data.
import type { AgentCtx } from "../server.js";
import { newContext, extractEmails, classifyLinks, safeGoto, saveScreenshot } from "./_shared.js";

export interface YouTubeInput {
  videoUrl?: string;
  channelUrl?: string;
  caseId?: string;
}

export async function investigateYouTube(ctx: AgentCtx, input: YouTubeInput) {
  const browserCtx = await newContext(ctx);
  const page = await browserCtx.newPage();
  const screenshots: string[] = [];
  const publicContacts = new Set<string>();
  const externalLinks: string[] = [];

  let title = "";
  let channelName = "";
  let channelUrl = input.channelUrl ?? "";
  let description = "";
  let thumbnailUrl = "";

  try {
    // 1) Video page (if provided)
    if (input.videoUrl) {
      const ok = await safeGoto(page, input.videoUrl);
      if (ok) {
        title = (await page.title()).replace(/ - YouTube$/, "");
        const og = await page
          .locator('meta[property="og:image"]')
          .first()
          .getAttribute("content")
          .catch(() => null);
        thumbnailUrl = og ?? "";
        description =
          (await page
            .locator('meta[name="description"]')
            .first()
            .getAttribute("content")
            .catch(() => null)) ?? "";
        if (!channelUrl) {
          channelUrl =
            (await page
              .locator('link[itemprop="url"], a[href*="/channel/"], a[href*="/@"]')
              .first()
              .getAttribute("href")
              .catch(() => null)) ?? "";
          if (channelUrl && channelUrl.startsWith("/")) channelUrl = `https://www.youtube.com${channelUrl}`;
        }
        channelName =
          (await page
            .locator('link[itemprop="name"], meta[itemprop="author"]')
            .first()
            .getAttribute("content")
            .catch(() => null)) ?? channelName;
        const shot = await saveScreenshot(ctx, page, input.caseId ?? "", "yt-video");
        screenshots.push(shot.url);
        extractEmails(`${title} ${description}`).forEach((e) => publicContacts.add(e));
      }
    }

    // 2) Channel About page
    if (channelUrl) {
      const about = channelUrl.replace(/\/$/, "") + "/about";
      const ok = await safeGoto(page, about);
      if (ok) {
        if (!channelName) channelName = (await page.title()).replace(/ - YouTube$/, "");
        const aboutText = await page.locator("body").innerText().catch(() => "");
        extractEmails(aboutText).forEach((e) => publicContacts.add(e));
        const links = await page.locator('a[href^="http"]').evaluateAll((els) =>
          (els as HTMLAnchorElement[]).map((a) => a.href),
        ).catch(() => []);
        const cls = classifyLinks(links);
        externalLinks.push(...cls.externals, ...cls.socials.map((s) => s.url));
        const shot = await saveScreenshot(ctx, page, input.caseId ?? "", "yt-about");
        screenshots.push(shot.url);
      }
    }
  } finally {
    await browserCtx.close().catch(() => {});
  }

  return {
    title,
    channelName,
    channelUrl,
    description,
    thumbnailUrl,
    screenshots,
    publicContacts: Array.from(publicContacts),
    externalLinks: Array.from(new Set(externalLinks)).slice(0, 20),
  };
}
