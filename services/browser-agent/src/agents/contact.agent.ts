// Contact-discovery agent: visits public channel/website/social pages,
// pulls visible emails, websites, contact-form URLs and social profiles.
import type { AgentCtx } from "../server.js";
import { newContext, extractEmails, classifyLinks, safeGoto } from "./_shared.js";

export interface ContactInput {
  name?: string;
  channelUrl?: string;
  websiteUrl?: string;
  socialLinks?: string[];
}

export async function discoverContacts(ctx: AgentCtx, input: ContactInput) {
  const emails = new Set<string>();
  const websites = new Set<string>();
  const contactForms = new Set<string>();
  const socialProfiles = new Set<string>();

  const targets: string[] = [];
  if (input.channelUrl) {
    targets.push(input.channelUrl);
    if (input.channelUrl.includes("youtube.com")) {
      targets.push(input.channelUrl.replace(/\/$/, "") + "/about");
    }
  }
  if (input.websiteUrl) {
    targets.push(input.websiteUrl);
    try {
      const u = new URL(input.websiteUrl);
      targets.push(`${u.origin}/contact`);
      targets.push(`${u.origin}/about`);
    } catch { /* ignore */ }
  }
  (input.socialLinks ?? []).slice(0, 8).forEach((s) => targets.push(s));

  if (!targets.length) {
    return { emails: [], websites: [], contactForms: [], socialProfiles: [], confidence: 0 };
  }

  const browserCtx = await newContext(ctx);
  const page = await browserCtx.newPage();

  try {
    for (const url of Array.from(new Set(targets)).slice(0, 10)) {
      const ok = await safeGoto(page, url, 15000);
      if (!ok) continue;
      const body = await page.locator("body").innerText().catch(() => "");
      const html = await page.content().catch(() => "");
      extractEmails(body + " " + html).forEach((e) => emails.add(e));

      const links = await page.locator('a[href^="http"]').evaluateAll((els) =>
        (els as HTMLAnchorElement[]).map((a) => a.href),
      ).catch(() => []);
      const cls = classifyLinks(links);
      cls.socials.forEach((s) => socialProfiles.add(s.url));
      cls.contactForms.forEach((c) => contactForms.add(c));
      cls.externals.forEach((w) => websites.add(w));
    }
  } finally {
    await browserCtx.close().catch(() => {});
  }

  // Crude confidence: more signals = more confident, capped at 0.95.
  const signals = emails.size * 0.4 + contactForms.size * 0.15 + socialProfiles.size * 0.05 + websites.size * 0.02;
  const confidence = Math.min(0.95, Number(signals.toFixed(2)));

  return {
    emails: Array.from(emails),
    websites: Array.from(websites).slice(0, 10),
    contactForms: Array.from(contactForms),
    socialProfiles: Array.from(socialProfiles),
    confidence,
  };
}
