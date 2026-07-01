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
    const { baseUrl, token, configured } = agentConfig();
    if (!configured) {
      return { online: false, configured: false, code: "not_configured" as const, reason: "BROWSER_AGENT_URL is not set" };
    }
    if (!token) {
      return { online: false, configured: true, code: "token_missing" as const, reason: "BROWSER_AGENT_TOKEN is not set" };
    }
    try {
      const t0 = Date.now();
      const res = await fetch(`${baseUrl!.replace(/\/$/, "")}/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        let body: any = {};
        try { body = await res.json(); } catch {}
        return { online: true, configured: true, code: "ok" as const, reason: "ok", latencyMs, service: body?.service ?? null };
      }
      if (res.status === 401 || res.status === 403) {
        return { online: false, configured: true, code: "unauthorized" as const, reason: `Bearer token rejected (HTTP ${res.status})`, latencyMs };
      }
      if (res.status >= 500) {
        return { online: false, configured: true, code: "launch_failed" as const, reason: `Agent returned HTTP ${res.status} — Playwright may have failed to start`, latencyMs };
      }
      return { online: false, configured: true, code: "http_error" as const, reason: `HTTP ${res.status}`, latencyMs };
    } catch (e) {
      const msg = (e as Error).message || "network error";
      const code = /timeout|aborted/i.test(msg) ? ("timeout" as const) : ("unreachable" as const);
      return { online: false, configured: true, code, reason: msg };
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
  "image.reverse",
] as const;


async function rawAgent<T>(path: string, init: RequestInit = {}): Promise<
  { offline: true; reason: string; status?: number } | { offline: false; data: T }
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
    if (!res.ok) {
      // Surface the exact worker error body — a 400 means invalid payload,
      // not that the agent is offline.
      const raw = await res.text().catch(() => "");
      let detail = raw.slice(0, 300);
      try { const j = JSON.parse(raw); detail = j.error ?? j.message ?? detail; } catch { /* keep raw */ }
      return { offline: true, status: res.status, reason: res.status >= 400 && res.status < 500
        ? `Invalid task payload (HTTP ${res.status}): ${detail}`
        : `Agent HTTP ${res.status}: ${detail}` };
    }
    return { offline: false, data: (await res.json()) as T };
  } catch (e) {
    return { offline: true, reason: (e as Error).message };
  }
}

async function persistTask(supabase: any, userId: string, task: any) {
  if (!task) return;
  // Detect a completion transition so we only analyze once per task.
  const { data: prev } = await supabase
    .from("agent_tasks")
    .select("status")
    .eq("user_id", userId)
    .eq("worker_task_id", task.id)
    .maybeSingle();
  const wasCompleted = prev?.status === "completed" || prev?.status === "analyzed";

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

  // On completion of a discovery task, feed evidence into AI analysis pipeline.
  const isDiscovery = task.type === "image.reverse";
  if (!wasCompleted && task.status === "completed" && isDiscovery) {
    try {
      const { analyzeCompletedAgentTask } = await import("./agent-analysis.server");
      await analyzeCompletedAgentTask(supabase, userId, task);
    } catch (e) {
      console.warn("post-completion analysis failed", (e as Error).message);
    }
  }
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

// ---- Live browser frame (polled every 1s by Agent Console) ----
// Proxies the worker's latest-live.png as a base64 data URL so the browser
// avoids mixed-content / cross-origin issues with the agent's HTTP host.
export const getAgentLiveFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workerTaskId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { baseUrl, token, configured } = agentConfig();
    if (!configured) return { offline: true as const, reason: "not_configured" };
    try {
      const res = await fetch(
        `${baseUrl!.replace(/\/$/, "")}/tasks/${encodeURIComponent(data.workerTaskId)}/live`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) return { offline: true as const, reason: `HTTP ${res.status}` };
      const body = (await res.json()) as {
        ready: boolean;
        label?: string | null;
        ts?: number;
        pageUrl?: string | null;
        status?: string;
        image?: string;
        mime?: string;
      };
      if (!body.ready || !body.image) {
        return { offline: false as const, ready: false, label: body.label ?? null, status: body.status ?? null };
      }
      return {
        offline: false as const,
        ready: true,
        label: body.label ?? "Browser session",
        ts: body.ts ?? Date.now(),
        pageUrl: body.pageUrl ?? null,
        status: body.status ?? null,
        dataUrl: `data:${body.mime ?? "image/png"};base64,${body.image}`,
      };
    } catch (e) {
      return { offline: true as const, reason: (e as Error).message };
    }
  });
