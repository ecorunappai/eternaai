// Evidence-capture agent: navigate to a public URL, screenshot it, return metadata.
import type { AgentCtx } from "../server.js";
import { newContext, safeGoto, saveScreenshot } from "./_shared.js";
import { randomUUID } from "node:crypto";

export interface EvidenceInput {
  url: string;
  caseId?: string;
  type?: "youtube" | "instagram" | "website";
}

export async function captureEvidence(ctx: AgentCtx, input: EvidenceInput) {
  const browserCtx = await newContext(ctx);
  const page = await browserCtx.newPage();
  const evidenceId = randomUUID();
  let pageTitle = "";
  let screenshotUrl = "";

  try {
    const ok = await safeGoto(page, input.url);
    if (ok) {
      pageTitle = await page.title().catch(() => "");
      const shot = await saveScreenshot(ctx, page, input.caseId ?? "", `ev-${input.type ?? "web"}`);
      screenshotUrl = shot.url;
    }
  } finally {
    await browserCtx.close().catch(() => {});
  }

  return {
    evidenceId,
    screenshotUrl,
    pageTitle,
    capturedAt: new Date().toISOString(),
  };
}
