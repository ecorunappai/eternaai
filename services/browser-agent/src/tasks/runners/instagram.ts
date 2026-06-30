// Instagram profile investigation. Uses the admin monitoring account session
// when IG_MONITOR_* env vars are set, otherwise falls back to public scrape.
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted } from "../store.js";
import { guardPublicPage } from "../guards.js";
import { snapshot } from "../screenshot.js";
import { getInstagramContext, instagramConfigured } from "../../agents/instagram-session.js";

export async function runInstagram(ctx: RunCtx, input: any) {
  const { browser, taskId, evidenceDir, publicBaseUrl } = ctx;
  const profileUrl: string = input.profileUrl;
  if (!profileUrl) throw new Error("profileUrl required");

  const useAuth = instagramConfigured();
  let ctxPage;
  try {
    ctxPage = useAuth
      ? await getInstagramContext(browser)
      : await browser.newContext({ viewport: { width: 1280, height: 800 } });
  } catch (e) {
    const msg = (e as Error).message;
    patchTask(taskId, { status: "needs_input", nextAction: msg });
    appendStep(taskId, { phase: "blocked", note: msg }, "needs_input");
    throw e;
  }

  const page = await ctxPage.newPage();
  try {
    patchTask(taskId, {
      status: "navigating",
      nextAction: useAuth ? "Open profile (authenticated)" : "Open profile",
    });
    await page.goto(profileUrl, { waitUntil: "networkidle", timeout: 120000 });

    if (!useAuth) {
      const guard = await guardPublicPage(page);
      if (!guard.ok) throw new Error(guard.reason);
    }

    const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, "profile");
    appendStep(taskId, { phase: "evidence_captured", url: page.url(), note: "Profile captured", screenshot: shot });

    patchTask(taskId, { status: "extracting", nextAction: "Read bio + links" });
    const bio = (await page.locator('meta[property="og:description"]').first().getAttribute("content").catch(() => "")) ?? "";
    const title = await page.title();
    const hrefs = await page.locator('a[href^="http"]').evaluateAll((els) =>
      Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).href))).filter((h) => !/instagram\.com|cdninstagram|facebook\.com/.test(h)),
    ).catch(() => []);
    const externalLinks = (hrefs as string[]).slice(0, 20);
    const emails = Array.from(new Set(bio.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []));
    const followerHint = /followers/i.test(await page.locator("header").innerText({ timeout: 2000 }).catch(() => ""));
    const suspiciousHandle = /\d{5,}|backup|official\d|_real_/.test(profileUrl);

    setExtracted(taskId, {
      profileUrl,
      bio,
      title,
      externalLinks,
      emails,
      authenticated: useAuth,
      heuristics: { hasFollowerSection: followerHint, suspiciousHandle },
    });
    if (emails.length) {
      patchTask(taskId, { status: "contact_found", nextAction: "Email found in bio" });
      appendStep(taskId, { phase: "contact_found", note: `Found ${emails.length} email(s) in bio` });
    }
    appendStep(taskId, { phase: "completed", note: "Instagram investigation complete" }, "completed");
  } finally {
    await ctxPage.close().catch(() => {});
  }
}
