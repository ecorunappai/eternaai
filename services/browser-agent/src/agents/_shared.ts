// Shared helpers for Playwright agents.
import type { Page, BrowserContext } from "playwright";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import type { AgentCtx } from "../server.js";

export const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function newContext(ctx: AgentCtx): Promise<BrowserContext> {
  return ctx.browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    deviceScaleFactor: 1,
    bypassCSP: false,
  });
}

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const BAD_EMAIL_SUFFIX = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase();
    if (BAD_EMAIL_SUFFIX.some((s) => e.endsWith(s))) continue;
    if (e.includes("example.com") || e.includes("sentry.io") || e.startsWith("noreply@")) continue;
    out.add(e);
    if (out.size >= 12) break;
  }
  return Array.from(out);
}

const SOCIAL_HOSTS = [
  "instagram.com", "facebook.com", "x.com", "twitter.com", "tiktok.com",
  "youtube.com", "linktr.ee", "beacons.ai", "linkedin.com", "threads.net",
];

export function classifyLinks(links: string[]): {
  socials: { url: string; host: string }[];
  externals: string[];
  contactForms: string[];
} {
  const socials: { url: string; host: string }[] = [];
  const externals: string[] = [];
  const contactForms: string[] = [];
  const seen = new Set<string>();
  for (const raw of links) {
    if (!raw) continue;
    let u: URL;
    try { u = new URL(raw); } catch { continue; }
    if (seen.has(u.toString())) continue;
    seen.add(u.toString());
    const host = u.hostname.replace(/^www\./, "");
    if (SOCIAL_HOSTS.some((s) => host.endsWith(s))) {
      socials.push({ url: u.toString(), host });
    } else if (/contact|support|press|business|reach|help/i.test(u.pathname)) {
      contactForms.push(u.toString());
    } else {
      externals.push(u.toString());
    }
  }
  return {
    socials: socials.slice(0, 20),
    externals: externals.slice(0, 30),
    contactForms: contactForms.slice(0, 10),
  };
}

export async function safeGoto(page: Page, url: string, timeout = 120000): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });

    return true;
  } catch {
    return false;
  }
}

export async function saveScreenshot(
  ctx: AgentCtx,
  page: Page,
  caseId: string,
  label: string,
): Promise<{ file: string; url: string }> {
  const id = caseId || "anon";
  const subdir = path.join(ctx.evidenceDir, id);
  await fs.mkdir(subdir, { recursive: true });
  const file = path.join(subdir, `${label}-${randomUUID().slice(0, 8)}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const rel = path.relative(ctx.evidenceDir, file).split(path.sep).join("/");
  return { file, url: `${ctx.publicBaseUrl}/evidence/${rel}` };
}
