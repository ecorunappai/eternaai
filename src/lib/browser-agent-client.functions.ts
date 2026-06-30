// Eterna AI — client for the external Playwright Browser Agent service.
// The agent runs on a VPS (see services/browser-agent). When it's offline,
// every call returns { offline: true } so the app degrades gracefully.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function agentConfig() {
  const baseUrl = process.env.BROWSER_AGENT_URL;
  const token = process.env.BROWSER_AGENT_TOKEN ?? "";
  return { baseUrl, token, configured: Boolean(baseUrl) };
}

async function callAgent<T>(path: string, body: unknown): Promise<
  { offline: true; reason: string } | { offline: false; data: T }
> {
  const { baseUrl, token, configured } = agentConfig();
  if (!configured) return { offline: true, reason: "BROWSER_AGENT_URL not configured" };
  try {
    const res = await fetch(`${baseUrl!.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      return { offline: true, reason: `Agent HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { offline: false, data };
  } catch (e) {
    return { offline: true, reason: (e as Error).message };
  }
}

// ---- Status probe (used by the UI banner) ----
export const browserAgentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { baseUrl, configured } = agentConfig();
    if (!configured) return { online: false, configured: false, reason: "Not configured" };
    try {
      const res = await fetch(`${baseUrl!.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return { online: res.ok, configured: true, reason: res.ok ? "ok" : `HTTP ${res.status}` };
    } catch (e) {
      return { online: false, configured: true, reason: (e as Error).message };
    }
  });

// ---- YouTube investigation ----
export const investigateYouTubeAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().uuid().optional(),
    videoUrl: z.string().url().optional(),
    channelUrl: z.string().url().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await callAgent<any>("/investigate/youtube", data);
    if (res.offline) return res;
    if (data.caseId) {
      await context.supabase.from("case_evidence").insert({
        case_id: data.caseId,
        user_id: context.userId,
        evidence_type: "browser_agent_youtube",
        source_url: data.videoUrl ?? data.channelUrl ?? "",
        content: res.data.title ?? null,
        metadata: res.data,
      });
    }
    return res;
  });

// ---- Instagram investigation ----
export const investigateInstagramAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().uuid().optional(),
    profileUrl: z.string().url().optional(),
    postUrl: z.string().url().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await callAgent<any>("/investigate/instagram", data);
    if (res.offline) return res;
    if (data.caseId) {
      await context.supabase.from("case_evidence").insert({
        case_id: data.caseId,
        user_id: context.userId,
        evidence_type: "browser_agent_instagram",
        source_url: data.profileUrl ?? data.postUrl ?? "",
        content: res.data.bio ?? null,
        metadata: res.data,
      });
    }
    return res;
  });

// ---- Contact discovery ----
export const discoverContactsAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().uuid().optional(),
    name: z.string().optional(),
    channelUrl: z.string().optional(),
    websiteUrl: z.string().optional(),
    socialLinks: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await callAgent<any>("/discover-contact", data);
    if (res.offline) return res;
    if (data.caseId && res.data) {
      const rows = [
        ...(res.data.emails ?? []).map((email: string) => ({
          case_id: data.caseId, user_id: context.userId, contact_type: "email",
          value: email, source_url: data.channelUrl ?? data.websiteUrl ?? "",
          source_label: "browser_agent", verified: false,
        })),
        ...(res.data.socialProfiles ?? []).slice(0, 10).map((url: string) => ({
          case_id: data.caseId, user_id: context.userId, contact_type: "social",
          value: url, source_url: data.channelUrl ?? data.websiteUrl ?? "",
          source_label: "browser_agent", verified: false,
        })),
      ];
      if (rows.length) {
        await context.supabase.from("creator_contacts").insert(rows);
      }
    }
    return res;
  });

// ---- Evidence capture ----
export const captureEvidenceAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().uuid().optional(),
    url: z.string().url(),
    type: z.enum(["youtube", "instagram", "website"]).default("website"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await callAgent<any>("/capture-evidence", data);
    if (res.offline) return res;
    if (data.caseId && res.data?.screenshotUrl) {
      await context.supabase.from("case_evidence").insert({
        case_id: data.caseId,
        user_id: context.userId,
        evidence_type: "screenshot",
        source_url: data.url,
        content: res.data.pageTitle ?? null,
        metadata: {
          screenshot_url: res.data.screenshotUrl,
          captured_at: res.data.capturedAt,
          evidence_id: res.data.evidenceId,
        },
      });
    }
    return res;
  });

// ====================================================================
// Task-based operator (queue, live session, approval gates)
// ====================================================================

const TASK_TYPES = [
  "youtube.investigate",
  "instagram.investigate",
  "contact.discover",
  "email.prepare",
  "takedown.prepare",
] as const;

async function rawAgent<T>(path: string, init: RequestInit = {}): Promise<
  { offline: true; reason: string } | { offline: false; data: T }
> {
  const { baseUrl, token, configured } = agentConfig();
  if (!configured) return { offline: true, reason: "BROWSER_AGENT_URL not configured" };
  try {
    const res = await fetch(`${baseUrl!.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { offline: true, reason: `Agent HTTP ${res.status}` };
    return { offline: false, data: (await res.json()) as T };
  } catch (e) {
    return { offline: true, reason: (e as Error).message };
  }
}

async function persistTask(supabase: any, userId: string, task: any) {
  if (!task) return;
  await supabase.from("agent_tasks").upsert({
    user_id: userId,
    case_id: task.caseId ?? null,
    worker_task_id: task.id,
    type: task.type,
    status: task.status,
    input: task.input ?? {},
    steps: task.steps ?? [],
    extracted: task.extracted ?? {},
    screenshots: task.screenshots ?? [],
    next_action: task.nextAction ?? null,
    error: task.error ?? null,
  }, { onConflict: "user_id,worker_task_id" });
}

export const enqueueAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    type: z.enum(TASK_TYPES),
    input: z.record(z.any()).default({}),
    caseId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await rawAgent<{ task: any }>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (res.offline) return res;
    await persistTask(context.supabase, context.userId, res.data.task);
    return { offline: false as const, task: res.data.task };
  });

export const getAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workerTaskId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await rawAgent<{ task: any }>(`/tasks/${encodeURIComponent(data.workerTaskId)}`, { method: "GET" });
    if (res.offline) {
      // Fall back to the persisted row so UI keeps working when worker is down.
      const { data: row } = await context.supabase.from("agent_tasks")
        .select("*").eq("worker_task_id", data.workerTaskId).eq("user_id", context.userId).maybeSingle();
      return { offline: true as const, reason: res.reason, task: row };
    }
    await persistTask(context.supabase, context.userId, res.data.task);
    return { offline: false as const, task: res.data.task };
  });

export const listAgentTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("agent_tasks")
      .select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(100);
    return { tasks: data ?? [] };
  });

export const approveAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workerTaskId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await rawAgent<{ task: any }>(`/tasks/${encodeURIComponent(data.workerTaskId)}/approve`, { method: "POST" });
    if (res.offline) return res;
    await persistTask(context.supabase, context.userId, res.data.task);
    return { offline: false as const, task: res.data.task };
  });

export const cancelAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workerTaskId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const res = await rawAgent<{ task: any }>(`/tasks/${encodeURIComponent(data.workerTaskId)}/cancel`, { method: "POST" });
    if (res.offline) return res;
    await persistTask(context.supabase, context.userId, res.data.task);
    return { offline: false as const, task: res.data.task };
  });
