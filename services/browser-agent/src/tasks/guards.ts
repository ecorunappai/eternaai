// Compliance guards — refuse to proceed on login walls, CAPTCHA, or private pages.
import type { Page } from "playwright";

const LOGIN_MARKERS = [
  /please sign in/i,
  /log in to continue/i,
  /sign in to confirm/i,
  /this content isn'?t available/i,
  /this account is private/i,
  /restricted video/i,
  /age[- ]restricted/i,
];

const CAPTCHA_MARKERS = [/captcha/i, /are you a human/i, /unusual traffic/i];

export type GuardResult = { ok: true } | { ok: false; reason: string };

export async function guardPublicPage(page: Page): Promise<GuardResult> {
  try {
    const url = page.url();
    // Cookie consent interstitials are NOT login walls — handled separately
    // in tasks/consent.ts. Only block on real auth pages.
    if (/\/login\b|\/accounts\/login|accounts\.google\.com\/(?:v3\/)?signin/i.test(url)) {
      return { ok: false, reason: `Redirected to login wall: ${url}` };
    }
    const body = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).slice(0, 4000);
    for (const m of CAPTCHA_MARKERS) if (m.test(body)) return { ok: false, reason: "CAPTCHA detected" };
    for (const m of LOGIN_MARKERS) if (m.test(body)) return { ok: false, reason: "Private / login-walled content" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `Guard error: ${(e as Error).message}` };
  }
}
