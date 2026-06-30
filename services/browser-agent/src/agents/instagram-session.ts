// Eterna AI — Instagram monitor session manager.
//
// Logs in to Instagram using the admin monitoring account credentials
// supplied via env vars (IG_MONITOR_USERNAME / IG_MONITOR_PASSWORD) and
// persists the resulting cookies on disk, encrypted with AES-256-GCM.
//
// Compliance:
//   • Credentials are read from env only — never accepted from API input,
//     never logged, never returned to the frontend.
//   • If Instagram presents an OTP, CAPTCHA, or any "suspicious login"
//     challenge, we stop immediately and surface "Manual verification
//     required". We do NOT attempt to bypass any security check.
//   • Cookies are stored encrypted; the key is derived from a server-only
//     secret (IG_SESSION_KEY → BROWSER_AGENT_TOKEN → hostname fallback).
import type { Browser, BrowserContext, Page } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const DATA_DIR = path.resolve(
  process.env.AGENT_DATA_DIR ?? path.resolve(process.cwd(), "data"),
);
const SESSION_FILE = path.join(DATA_DIR, "ig-session.enc");
const STATUS_FILE = path.join(DATA_DIR, "ig-session-status.json");

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // refresh weekly

export type InstagramStatus = {
  configured: boolean;
  username: string | null;
  state:
    | "not_configured"
    | "logged_out"
    | "logged_in"
    | "needs_verification"
    | "error";
  lastLoginAt: string | null;
  lastError: string | null;
};

function envCreds(): { username: string; password: string } | null {
  const u = process.env.IG_MONITOR_USERNAME?.trim();
  const p = process.env.IG_MONITOR_PASSWORD;
  if (!u || !p) return null;
  return { username: u, password: p };
}

function key(): Buffer {
  const seed =
    process.env.IG_SESSION_KEY ||
    process.env.BROWSER_AGENT_TOKEN ||
    `eterna-${process.env.HOSTNAME ?? "agent"}`;
  return crypto.createHash("sha256").update(seed).digest();
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStatus(): Promise<InstagramStatus> {
  const creds = envCreds();
  const base: InstagramStatus = {
    configured: !!creds,
    username: creds?.username ?? null,
    state: creds ? "logged_out" : "not_configured",
    lastLoginAt: null,
    lastError: null,
  };
  try {
    const raw = await fs.readFile(STATUS_FILE, "utf8");
    const persisted = JSON.parse(raw) as Partial<InstagramStatus>;
    return { ...base, ...persisted, configured: base.configured, username: base.username };
  } catch {
    return base;
  }
}

async function writeStatus(patch: Partial<InstagramStatus>) {
  await ensureDir();
  const cur = await readStatus();
  const next = { ...cur, ...patch };
  // Never persist sensitive fields.
  delete (next as any).password;
  await fs.writeFile(STATUS_FILE, JSON.stringify(next, null, 2));
}

export async function getInstagramStatus(): Promise<InstagramStatus> {
  return readStatus();
}

// ---- Session storage (encrypted Playwright storageState) ----
async function loadStorageState(): Promise<any | null> {
  try {
    const enc = await fs.readFile(SESSION_FILE, "utf8");
    const json = decrypt(enc);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function saveStorageState(state: any) {
  await ensureDir();
  await fs.writeFile(SESSION_FILE, encrypt(JSON.stringify(state)));
}

async function clearStorageState() {
  await fs.rm(SESSION_FILE, { force: true });
}

// ---- Challenge detection ----
async function detectChallenge(page: Page): Promise<string | null> {
  const url = page.url();
  if (/\/challenge\//i.test(url)) return "Security challenge required";
  if (/two_factor|2fa|checkpoint/i.test(url)) return "Two-factor authentication required";
  if (/suspicious/i.test(url)) return "Suspicious login flagged by Instagram";
  const body = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).slice(0, 4000);
  if (/enter the code|confirmation code|two[- ]factor|verify it'?s you|suspicious login|unusual activity|we sent you a code|captcha/i.test(body)) {
    return "Verification code or CAPTCHA requested by Instagram";
  }
  return null;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // Cheap heuristic: visit the home feed and check for the login form.
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const hasLogin = await page.locator('input[name="username"]').first().isVisible().catch(() => false);
    return !hasLogin;
  } catch {
    return false;
  }
}

async function performLogin(page: Page, username: string, password: string) {
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 60000 });
  // Cookie banner — best-effort dismiss.
  await page
    .locator('button:has-text("Allow all cookies"), button:has-text("Only allow essential cookies")')
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.fill('input[name="username"]', username, { timeout: 15000 });
  await page.fill('input[name="password"]', password, { timeout: 15000 });
  await page.locator('button[type="submit"]').first().click({ timeout: 15000 });
  // Wait for navigation or challenge.
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const challenge = await detectChallenge(page);
  if (challenge) {
    throw new Error(`Manual verification required: ${challenge}`);
  }
  // Final confirmation — must reach a logged-in page.
  if (!(await isLoggedIn(page))) {
    throw new Error("Login did not complete — Instagram returned to the login page");
  }
}

let loginInFlight: Promise<void> | null = null;

async function loginAndPersist(browser: Browser): Promise<void> {
  const creds = envCreds();
  if (!creds) throw new Error("Instagram monitor credentials not configured");
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    try {
      await performLogin(page, creds.username, creds.password);
      const state = await ctx.storageState();
      await saveStorageState(state);
      await writeStatus({
        state: "logged_in",
        lastLoginAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (e) {
      const msg = (e as Error).message;
      const needsVerify = /manual verification/i.test(msg);
      await writeStatus({
        state: needsVerify ? "needs_verification" : "error",
        lastError: msg,
      });
      await clearStorageState();
      throw e;
    } finally {
      await ctx.close().catch(() => {});
      loginInFlight = null;
    }
  })();
  return loginInFlight;
}

// Public entry point: returns a logged-in BrowserContext.
// Reuses encrypted cookies when available; logs in once if missing/expired.
// Retries the login flow ONCE if the persisted session was rejected.
export async function getInstagramContext(browser: Browser): Promise<BrowserContext> {
  const creds = envCreds();
  if (!creds) throw new Error("Instagram monitor credentials not configured");

  // Refresh stale sessions proactively.
  const status = await readStatus();
  const stale =
    !status.lastLoginAt ||
    Date.now() - new Date(status.lastLoginAt).getTime() > SESSION_TTL_MS;

  let stored = await loadStorageState();
  if (!stored || stale) {
    await loginAndPersist(browser);
    stored = await loadStorageState();
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: stored ?? undefined,
  });

  // Validate session; if expired, retry login once.
  const probe = await context.newPage();
  const ok = await isLoggedIn(probe);
  await probe.close().catch(() => {});
  if (!ok) {
    await context.close().catch(() => {});
    await clearStorageState();
    await loginAndPersist(browser);
    const fresh = await loadStorageState();
    return browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: fresh ?? undefined,
    });
  }
  return context;
}

export function instagramConfigured(): boolean {
  return !!envCreds();
}
