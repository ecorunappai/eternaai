// Warning email preparation — generates a draft and halts at "waiting_approval".
// Does NOT send. The Eterna app + manager are the senders of record.
import type { RunCtx } from "../queue.js";
import { appendStep, patchTask, setExtracted } from "../store.js";

export async function runEmail(ctx: RunCtx, input: any) {
  const { taskId } = ctx;
  const recipient = String(input.recipientEmail ?? "").trim();
  const subjectName = String(input.subjectName ?? "the rights holder");
  const evidenceLinks: string[] = input.evidenceLinks ?? [];
  const targetUrl: string = input.targetUrl ?? "";
  const deadlineHours = Number(input.deadlineHours ?? 72);
  if (!recipient) throw new Error("recipientEmail required");

  patchTask(taskId, { status: "extracting", nextAction: "Compose draft" });
  const subject = `[Eterna AI] Unauthorized use of ${subjectName}'s content — action required within ${deadlineHours}h`;
  const body =
`Hello,

We represent ${subjectName} via Eterna AI's content protection platform. Our automated monitoring has identified content at the following URL that appears to use ${subjectName}'s likeness, voice, or copyrighted material without authorization:

  ${targetUrl || "(target URL on file)"}

Evidence captured by our investigators:
${evidenceLinks.length ? evidenceLinks.map((u) => "  - " + u).join("\n") : "  (attached separately)"}

We ask that you remove the content within ${deadlineHours} hours of receipt of this notice. If we do not receive a reply or see the content removed by then, we will proceed with formal takedown reports under the platform's policies and applicable copyright / publicity-rights law.

This message is a courtesy warning before any platform-level enforcement.

Regards,
Eterna AI on behalf of ${subjectName}
`;

  setExtracted(taskId, {
    draft: { recipient, subject, body, evidenceLinks, deadlineHours },
  });
  appendStep(taskId, { phase: "email_drafted", note: `Draft prepared for ${recipient}` }, "email_drafted");

  patchTask(taskId, {
    status: "waiting_approval",
    nextAction: "Awaiting manager approval before send",
  });
  appendStep(taskId, { phase: "waiting_approval", note: "Halted for manager approval (no auto-send)" });
}
