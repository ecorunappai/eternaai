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

  // Try role-based button first (works across languages via accessible name).
  const byRole = page.getByRole("button", { name: CONSENT_BUTTON_RE }).first();
  const byForm = page.locator('form[action*="save"] button, button[aria-label*="Accept" i], button[aria-label*="Reject" i], button[aria-label*="Godk" i], button[aria-label*="Avvisa" i]').first();

  let clicked = false;
  try {
    await byRole.click({ timeout });
    clicked = true;
  } catch {
    try {
      await byForm.click({ timeout: 3000 });
      clicked = true;
    } catch {
      // no-op — consent screen structure may have changed
    }
  }

  if (clicked) {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // If we're still stuck on consent host, force-navigate to the target.
  if (targetUrl && isConsentUrl(page.url())) {
    await page.goto(targetUrl, { waitUntil: "commit", timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  return clicked;
}
