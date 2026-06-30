import path from "node:path";
import fs from "node:fs/promises";
import type { Page } from "playwright";

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
  await page.screenshot({ path: abs, fullPage: false });
  return `${publicBaseUrl.replace(/\/$/, "")}/evidence/${taskId}/${file}`;
}
