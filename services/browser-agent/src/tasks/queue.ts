// In-process task queue. Spawns runners with a shared Playwright browser.
import PQueue from "p-queue";
import { v4 as uuid } from "uuid";
import type { Browser } from "playwright";
import { createTask, patchTask, getTask, appendStep } from "./store.js";
import type { AgentTask, TaskType } from "./types.js";
import { runYouTube } from "./runners/youtube.js";
import { runInstagram } from "./runners/instagram.js";
import { runContact } from "./runners/contact.js";
import { runEmail } from "./runners/email.js";
import { runTakedown } from "./runners/takedown.js";

export interface RunCtx {
  browser: Browser;
  evidenceDir: string;
  publicBaseUrl: string;
  taskId: string;
}

const queue = new PQueue({ concurrency: Number(process.env.AGENT_CONCURRENCY ?? 2) });

const RUNNERS: Record<TaskType, (ctx: RunCtx, input: any) => Promise<void>> = {
  "youtube.investigate": runYouTube,
  "instagram.investigate": runInstagram,
  "contact.discover": runContact,
  "email.prepare": runEmail,
  "takedown.prepare": runTakedown,
};

export interface EnqueueOpts {
  type: TaskType;
  input: Record<string, unknown>;
  caseId?: string;
  getBrowser: () => Promise<Browser>;
  evidenceDir: string;
  publicBaseUrl: string;
}

export function enqueue(opts: EnqueueOpts): AgentTask {
  const task = createTask({
    id: uuid(),
    type: opts.type,
    caseId: opts.caseId,
    status: "queued",
    input: opts.input,
  });

  queue.add(async () => {
    try {
      const browser = await opts.getBrowser();
      appendStep(task.id, { phase: "browser_opened", note: "Browser session started" });
      const runner = RUNNERS[opts.type];
      if (!runner) throw new Error(`Unknown task type: ${opts.type}`);
      await runner(
        { browser, evidenceDir: opts.evidenceDir, publicBaseUrl: opts.publicBaseUrl, taskId: task.id },
        opts.input,
      );
      const final = getTask(task.id);
      if (final && final.status !== "waiting_approval" && final.status !== "failed" && final.status !== "cancelled") {
        patchTask(task.id, { status: "completed", nextAction: null });
      }
    } catch (e) {
      patchTask(task.id, { status: "failed", error: (e as Error).message, nextAction: null });
      appendStep(task.id, { phase: "guard", note: `Failed: ${(e as Error).message}` }, "failed");
    }
  });

  return task;
}

export function approve(id: string) {
  const t = getTask(id);
  if (!t) return null;
  if (t.status === "waiting_approval") {
    patchTask(id, { status: "completed", nextAction: null });
    appendStep(id, { phase: "completed", note: "Approved by manager" });
  }
  return getTask(id);
}

export function cancel(id: string) {
  const t = getTask(id);
  if (!t) return null;
  patchTask(id, { status: "cancelled", nextAction: null });
  appendStep(id, { phase: "cancelled", note: "Cancelled by operator" });
  return getTask(id);
}
