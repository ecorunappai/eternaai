// Handle YouTube/Google cookie consent interstitials (consent.youtube.com,
// consent.google.com). Auto-accept/reject and return to the original URL.
import type { Page } from "playwright";

const CONSENT_HOST_RE = /consent\.(youtube|google)\./i;
const CONSENT_BUTTON_RE =
  /Godk(?:ä|a)nn alla|Accept all|Alla akzeptieren|Tout accepter|Aceptar todo|Accetta tutto|Aceitar tudo|Reject all|Avvisa alla|Alle ablehnen|Tout refuser|Rechazar todo|Rifiuta tutto|Rejeitar tudo|I agree|Agree/i;

export function isConsentUrl(url: string): boolean {
  return CONSENT_HOST_RE.test(url);
}

/**
 * If the page is on a Google/YouTube consent interstitial, click the
 * accept/reject button, wait for navigation, and optionally continue to
 * `targetUrl`. Safe to call unconditionally — returns false when not on
 * a consent page.
 */
export async function handleConsent(page: Page, targetUrl?: string, timeout = 8000): Promise<boolean> {
  if (!isConsentUrl(page.url())) return false;

  // Wait for consent UI to render (Swedish `hl=sv` variant is server-rendered
  // but form buttons hydrate slightly after load).
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const attempts: Array<() => Promise<void>> = [
    // 1. Role-based (accessible name, works across languages)
    async () => {
      await page.getByRole("button", { name: CONSENT_BUTTON_RE }).first().click({ timeout });
    },
    // 2. Text-based match on any clickable
    async () => {
      await page.locator(`button:has-text("Godkänn alla"), button:has-text("Accept all"), button:has-text("Avvisa alla"), button:has-text("Reject all")`).first().click({ timeout: 4000 });
    },
    // 3. Submit any form whose action saves consent (last-resort)
    async () => {
      await page.locator('form[action*="save"] button, form[action*="consent"] button').first().click({ timeout: 4000 });
    },
    // 4. aria-label variants
    async () => {
      await page.locator('button[aria-label*="Accept" i], button[aria-label*="Reject" i], button[aria-label*="Godk" i], button[aria-label*="Avvisa" i]').first().click({ timeout: 4000 });
    },
    // 5. Iframe fallback (Google sometimes wraps the dialog in an iframe)
    async () => {
      for (const frame of page.frames()) {
        if (!/consent\.(youtube|google)\./i.test(frame.url())) continue;
        const btn = frame.getByRole("button", { name: CONSENT_BUTTON_RE }).first();
        await btn.click({ timeout: 4000 });
        return;
      }
      throw new Error("no consent iframe");
    },
  ];

  let clicked = false;
  for (const attempt of attempts) {
    try {
      await attempt();
      clicked = true;
      break;
    } catch {
      // try next strategy
    }
  }

  if (clicked) {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // If we're still stuck on consent host, force-navigate to the target.
  if (targetUrl && isConsentUrl(page.url())) {
    await page.goto(targetUrl, { waitUntil: "commit", timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  return clicked;
}

