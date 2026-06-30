// Takedown preparation — opens the platform report page, captures the form,
// pre-fills *visible client-side state only*, screenshots the prepared form,
// and HALTS at "waiting_approval". Never auto-submits.
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted } from "../store.js";
import { guardPublicPage } from "../guards.js";
import { snapshot } from "../screenshot.js";

const REPORT_PAGES: Record<string, string> = {
  youtube: "https://www.youtube.com/copyright_complaint_form",
  instagram: "https://help.instagram.com/contact/372592039493026",
  tiktok: "https://www.tiktok.com/legal/report/Copyright",
  facebook: "https://www.facebook.com/help/contact/1758255661104383",
  twitter: "https://help.x.com/forms/ipi",
  x: "https://help.x.com/forms/ipi",
};

export async function runTakedown(ctx: RunCtx, input: any) {
  const { browser, taskId, evidenceDir, publicBaseUrl } = ctx;
  const platform: string = String(input.platform ?? "").toLowerCase();
  const reportUrl = REPORT_PAGES[platform] ?? input.reportUrl;
  if (!reportUrl) throw new Error(`No known report URL for platform "${platform}"`);

  const ctxPage = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctxPage.newPage();
  try {
    patchTask(taskId, { status: "navigating", nextAction: `Open ${platform} report page` });
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const guard = await guardPublicPage(page);
    if (!guard.ok) {
      appendStep(taskId, { phase: "guard", url: reportUrl, note: guard.reason });
      // Still produce a checklist the manager can use to submit manually.
    } else {
      const shot = await snapshot(page, taskId, evidenceDir, publicBaseUrl, "report_form");
      appendStep(taskId, { phase: "evidence_captured", url: reportUrl, note: "Report form opened", screenshot: shot });
    }

    // Enumerate visible input fields (read-only, never auto-submit).
    const fields = await page.locator("input, textarea, select").evaluateAll((els) =>
      els.slice(0, 40).map((e) => {
        const i = e as HTMLInputElement;
        return { name: i.name || i.id || "(unnamed)", type: i.type || i.tagName.toLowerCase(), label: i.getAttribute("aria-label") || i.placeholder || "" };
      }),
    ).catch(() => []);

    patchTask(taskId, { status: "form_prepared", nextAction: "Review pre-filled fields, then submit manually" });
    setExtracted(taskId, {
      reportUrl,
      platform,
      fields,
      prefill: {
        copyright_owner: input.rightsOwnerName,
        infringing_url: input.targetUrl,
        original_work_url: input.originalUrl,
        signature: input.signature,
        good_faith_statement: "Under penalty of perjury, the information in this notice is accurate and I am authorized to act on behalf of the rights holder.",
        evidence: input.evidenceLinks ?? [],
      },
      note: "Fields are NOT auto-submitted. A manager must paste these into the form and click submit.",
    });
    appendStep(taskId, { phase: "form_prepared", note: `${fields.length} form field(s) catalogued` });

    patchTask(taskId, { status: "waiting_approval", nextAction: "Manager must review & submit (no auto-submit)" });
    appendStep(taskId, { phase: "waiting_approval", note: "Halted before submit — manager approval required" });
  } finally {
    await ctxPage.close().catch(() => {});
  }
}
