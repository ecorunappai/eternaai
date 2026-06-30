// Instagram public-profile investigator. We only read the unauthenticated
// landing meta tags / public profile page; never log in, never bypass walls.
import type { AgentCtx } from "../server.js";
import { newContext, extractEmails, classifyLinks, safeGoto, saveScreenshot } from "./_shared.js";

export interface InstagramInput {
  profileUrl?: string;
  postUrl?: string;
  caseId?: string;
}

export async function investigateInstagram(ctx: AgentCtx, input: InstagramInput) {
  const browserCtx = await newContext(ctx);
  const page = await browserCtx.newPage();
  const screenshots: string[] = [];
  const publicContacts = new Set<string>();
  const externalLinks: string[] = [];
  let username = "";
  let bio = "";

  const targets = [input.profileUrl, input.postUrl].filter(Boolean) as string[];
  try {
    for (const url of targets) {
      const ok = await safeGoto(page, url);
      if (!ok) continue;

      // If a login wall appears, do NOT bypass — just record what's in meta.
      const ogTitle =
        (await page.locator('meta[property="og:title"]').first().getAttribute("content").catch(() => null)) ?? "";
      const ogDesc =
        (await page.locator('meta[property="og:description"]').first().getAttribute("content").catch(() => null)) ?? "";
      const ogUrl =
        (await page.locator('meta[property="og:url"]').first().getAttribute("content").catch(() => null)) ?? "";

      if (!username) {
        const m = (ogUrl || url).match(/instagram\.com\/([^/?#]+)/);
        if (m) username = m[1];
      }
      if (!bio) bio = ogDesc || ogTitle;

      extractEmails(`${ogTitle} ${ogDesc}`).forEach((e) => publicContacts.add(e));

      // Pull whatever external links Instagram serves in the public DOM
      const links = await page.locator('a[href^="http"]').evaluateAll((els) =>
        (els as HTMLAnchorElement[]).map((a) => a.href),
      ).catch(() => []);
      const cls = classifyLinks(links.filter((l) => !l.includes("instagram.com")));
      externalLinks.push(...cls.externals, ...cls.socials.map((s) => s.url));

      const shot = await saveScreenshot(ctx, page, input.caseId ?? "", "ig");
      screenshots.push(shot.url);
    }
  } finally {
    await browserCtx.close().catch(() => {});
  }

  return {
    username,
    bio,
    externalLinks: Array.from(new Set(externalLinks)).slice(0, 20),
    screenshots,
    publicContacts: Array.from(publicContacts),
  };
}
