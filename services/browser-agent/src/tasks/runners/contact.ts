// Contact discovery — visits website + linked Linktree/Beacons/Carrd pages
// and extracts public emails, contact forms, and social profiles.
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted } from "../store.js";
import { guardPublicPage } from "../guards.js";
import { snapshot } from "../screenshot.js";

const SOCIAL = /instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|facebook\.com|linkedin\.com|threads\.net/i;
const AGGREGATOR = /linktr\.ee|beacons\.ai|carrd\.co|bio\.link|allmylinks/i;

export async function runContact(ctx: RunCtx, input: any) {
  const { browser, taskId, evidenceDir, publicBaseUrl } = ctx;
  const seeds: string[] = [input.websiteUrl, ...(input.socialLinks ?? [])].filter(Boolean);
  if (!seeds.length) throw new Error("websiteUrl or socialLinks required");

  const ctxPage = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctxPage.newPage();
  const emails = new Set<string>();
  const socials = new Set<string>();
  const contactForms: string[] = [];

  try {
    const queue = [...seeds];
    const visited = new Set<string>();
    while (queue.length && visited.size < 6) {
      const url = queue.shift()!;
      if (!url || visited.has(url)) continue;
      visited.add(url);
      patchTask(taskId, { status: "navigating", nextAction: `Visit ${url}` });
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        const guard = await guardPublicPage(page);
        if (!guard.ok) { appendStep(taskId, { phase: "guard", url, note: guard.reason }); continue; }
        const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, `site_${visited.size}`);
        appendStep(taskId, { phase: "evidence_captured", url, note: `Captured ${url}`, screenshot: shot });

        const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
        (text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).forEach((e) => emails.add(e));

        const hasContactForm = (await page.locator("form").count().catch(() => 0)) > 0 && /contact/i.test(url);
        if (hasContactForm) contactForms.push(url);

        const hrefs = (await page.locator('a[href^="http"]').evaluateAll((els) =>
          Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).href))),
        ).catch(() => [])) as string[];

        for (const h of hrefs) {
          if (SOCIAL.test(h)) socials.add(h);
          if (AGGREGATOR.test(h) && !visited.has(h)) queue.push(h);
        }

        // /contact page
        const contactLink = hrefs.find((h) => /\/contact/i.test(h));
        if (contactLink && !visited.has(contactLink)) queue.push(contactLink);
      } catch (e) {
        appendStep(taskId, { phase: "guard", url, note: `Skip ${url}: ${(e as Error).message}` });
      }
    }

    setExtracted(taskId, {
      emails: Array.from(emails),
      socialProfiles: Array.from(socials),
      contactForms,
      visited: Array.from(visited),
    });
    patchTask(taskId, {
      status: emails.size ? "contact_found" : "completed",
      nextAction: emails.size ? `${emails.size} email(s) found — review & draft warning` : "No public contact found",
    });
    appendStep(taskId, { phase: emails.size ? "contact_found" : "completed", note: `Visited ${visited.size} page(s)` });
  } finally {
    await ctxPage.close().catch(() => {});
  }
}
