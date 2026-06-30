// Screenshot helper: writes a timestamped frame AND overwrites a per-task
// `latest-live.png` (+ `latest-live.json` with the current step label) that
// the Agent Console polls every second for the live browser view.
import path from "node:path";
import fs from "node:fs/promises";
import type { Page } from "playwright";

// Friendly labels for known snapshot tags — keep in sync with runner tags.
const LABEL_MAP: Record<string, string> = {
  goto: "Opening page",
  open_youtube: "Opening YouTube",
  search_results: "Reading search results",
  search_typed: "Searching keyword",
  scroll: "Scrolling for more results",
  click_result: "Opening result",
  video_1: "Opening video (1/3)",
  video_2: "Opening video (2/3)",
  video_3: "Opening video (3/3)",
  channel: "Opening channel",
  about: "Extracting channel info",
  extract: "Extracting data",
  evidence: "Capturing evidence",
  error: "Error captured",
};

export function friendlyLabel(tag: string): string {
  return LABEL_MAP[tag] ?? tag.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function snapshot(
  page: Page,
  taskId: string,
  evidenceDir: string,
  publicBaseUrl: string,
  label: string,
): Promise<string> {
  const dir = path.join(evidenceDir, taskId);
  await fs.mkdir(dir, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 48);
  const file = `${Date.now()}_${safe}.png`;
  const abs = path.join(dir, file);
  try {
    const buf = await page.screenshot({ fullPage: false });
    await fs.writeFile(abs, buf);
    // Live frame for Agent Console polling. Best-effort; never throws.
    await fs.writeFile(path.join(dir, "latest-live.png"), buf).catch(() => {});
    await fs.writeFile(
      path.join(dir, "latest-live.json"),
      JSON.stringify({ label: friendlyLabel(label), tag: label, ts: Date.now(), url: page.url() }),
    ).catch(() => {});
  } catch {
    // Page may be closing — ignore.
  }
  return `${publicBaseUrl.replace(/\/$/, "")}/evidence/${taskId}/${file}`;
}

// Used by runners to record an error frame even after a navigation failure.
export async function snapshotError(
  page: Page,
  taskId: string,
  evidenceDir: string,
  publicBaseUrl: string,
  message: string,
): Promise<string | null> {
  try {
    return await snapshot(page, taskId, evidenceDir, publicBaseUrl, "error");
  } catch {
    // Still publish a label so the UI shows "Error captured" instead of stale.
    try {
      const dir = path.join(evidenceDir, taskId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "latest-live.json"),
        JSON.stringify({ label: "Error captured", tag: "error", ts: Date.now(), error: message }),
      );
    } catch {}
    return null;
  }
}
