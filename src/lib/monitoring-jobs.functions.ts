// Eterna AI — Auto-monitoring jobs created from the Content Registry.
// Each registered asset spawns a set of recurring browser-agent scans
// (YouTube latest, troll/reaction/expose, Instagram impersonation, Google
// web search, weekly content misuse). A scheduler dispatches due jobs,
// honoring the worker's 1-active-task concurrency limit.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SCAN_TEMPLATES = [
  {
    scan_type: "youtube_latest",
    worker_task_type: "youtube.investigate",
    frequency: "daily",
    label: "YouTube — latest mentions",
    buildInput: (p: ProtectionProfile) => ({
      query: `${p.creatorName} latest`,
      source: "content_registry",
      assetName: p.creatorName,
    }),
  },
  {
    scan_type: "youtube_troll",
    worker_task_type: "youtube.investigate",
    frequency: "daily",
    label: "YouTube — troll / reaction / expose",
    buildInput: (p: ProtectionProfile) => ({
      query: `${p.creatorName} (troll OR reaction OR expose OR roast OR diss)`,
      source: "content_registry",
      assetName: p.creatorName,
    }),
  },
  {
    scan_type: "instagram_impersonation",
    worker_task_type: "instagram.investigate",
    frequency: "daily",
    label: "Instagram — impersonation / profile",
    buildInput: (p: ProtectionProfile) => ({
      profileUrl:
        p.officialInstagramUrl ||
        `https://www.instagram.com/${slug(p.creatorName)}/`,
      query: `${p.creatorName} fake OR impersonation OR scam`,
      source: "content_registry",
      assetName: p.creatorName,
    }),
  },
  {
    scan_type: "google_web",
    worker_task_type: "youtube.investigate", // worker handles generic search
    frequency: "daily",
    label: "Google — web mentions",
    buildInput: (p: ProtectionProfile) => ({
      query: `"${p.creatorName}" ${(p.keywords ?? []).slice(0, 3).join(" ")}`.trim(),
      engine: "google",
      source: "content_registry",
      assetName: p.creatorName,
    }),
  },
  {
    scan_type: "content_misuse",
    worker_task_type: "youtube.investigate",
    frequency: "weekly",
    label: "Content misuse — weekly sweep",
    buildInput: (p: ProtectionProfile) => ({
      query: `${p.creatorName} leaked OR reupload OR stolen`,
      source: "content_registry",
      assetName: p.creatorName,
    }),
  },
] as const;

type ProtectionProfile = {
  creatorName: string;
  officialYoutubeUrl?: string | null;
  officialInstagramUrl?: string | null;
  keywords?: string[];
  issueTypes?: string[];
};

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
}

function nextRunFor(frequency: string, from = new Date()): Date {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else d.setDate(d.getDate() + 1);
  return d;
}

// ---- Create monitoring profile + job set when user registers an asset ----
export const setupAssetMonitoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        assetId: z.string().uuid().optional(),
        creatorName: z.string().min(1),
        officialYoutubeUrl: z.string().url().optional().or(z.literal("")),
        officialInstagramUrl: z.string().url().optional().or(z.literal("")),
        keywords: z.array(z.string()).default([]),
        issueTypes: z.array(z.string()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Upsert monitoring profile
    const { data: profile, error: profErr } = await supabase
      .from("monitoring_profiles")
      .insert({
        user_id: userId,
        asset_id: data.assetId ?? null,
        creator_name: data.creatorName,
        official_youtube_url: data.officialYoutubeUrl || null,
        official_instagram_url: data.officialInstagramUrl || null,
        keywords: data.keywords,
        issue_types: data.issueTypes,
        platforms: ["youtube", "instagram", "google", "web"],
        scan_frequency: "daily",
        auto_scan: true,
        status: "active",
      })
      .select("id")
      .single();
    if (profErr) throw new Error(profErr.message);

    const rows = SCAN_TEMPLATES.map((t) => ({
      user_id: userId,
      asset_id: data.assetId ?? null,
      profile_id: profile.id,
      source: "content_registry",
      asset_name: data.creatorName,
      scan_type: t.scan_type,
      worker_task_type: t.worker_task_type,
      frequency: t.frequency,
      status: "active",
      config: t.buildInput({
        creatorName: data.creatorName,
        officialYoutubeUrl: data.officialYoutubeUrl,
        officialInstagramUrl: data.officialInstagramUrl,
        keywords: data.keywords,
        issueTypes: data.issueTypes,
      }),
      next_run_at: new Date().toISOString(),
    }));

    const { error: jobErr } = await supabase.from("monitoring_jobs").insert(rows);
    if (jobErr) throw new Error(jobErr.message);

    return { profileId: profile.id, jobsCreated: rows.length };
  });

// ---- List user's monitoring jobs ----
export const listMonitoringJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("monitoring_jobs")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return { jobs: data ?? [] };
  });

// ---- Pause / resume / delete ----
export const pauseMonitoringJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["active", "paused"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("monitoring_jobs")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const deleteMonitoringJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("monitoring_jobs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

// ---- Run now: enqueue an agent_task for this job (respects 1-active limit) ----
async function enqueueViaWorker(input: {
  type: string;
  input: Record<string, unknown>;
}): Promise<{ offline: boolean; reason?: string; task?: any }> {
  const baseUrl = process.env.BROWSER_AGENT_URL;
  const token = process.env.BROWSER_AGENT_TOKEN ?? "";
  if (!baseUrl) return { offline: true, reason: "BROWSER_AGENT_URL not configured" };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { offline: true, reason: `Agent HTTP ${res.status}` };
    const body = (await res.json()) as { task: any };
    return { offline: false, task: body.task };
  } catch (e) {
    return { offline: true, reason: (e as Error).message };
  }
}

export const runMonitoringJobNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job } = await supabase
      .from("monitoring_jobs")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!job) throw new Error("Job not found");

    // Enforce 1-active rule client-side too: queue if user has running task
    const { count: activeCount } = await supabase
      .from("agent_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "running", "browsing", "navigating", "extracting", "analyzing"]);

    const enq = await enqueueViaWorker({
      type: job.worker_task_type,
      input: { ...(job.config ?? {}), monitoringJobId: job.id },
    });

    if (enq.offline) {
      return { offline: true, reason: enq.reason, queued: (activeCount ?? 0) > 0 };
    }

    // Persist task row + update job
    await supabase.from("agent_tasks").upsert(
      {
        user_id: userId,
        worker_task_id: enq.task.id,
        type: enq.task.type,
        status: enq.task.status,
        input: enq.task.input ?? {},
        steps: enq.task.steps ?? [],
        extracted: enq.task.extracted ?? {},
        screenshots: enq.task.screenshots ?? [],
        next_action: enq.task.nextAction ?? null,
      },
      { onConflict: "user_id,worker_task_id" },
    );

    await supabase
      .from("monitoring_jobs")
      .update({
        last_run_at: new Date().toISOString(),
        last_worker_task_id: enq.task.id,
        run_count: (job.run_count ?? 0) + 1,
        next_run_at: nextRunFor(job.frequency).toISOString(),
      })
      .eq("id", job.id);

    return { offline: false, taskId: enq.task.id, queued: (activeCount ?? 0) > 0 };
  });

// ---- Cron: dispatch all due jobs, but only 1 active at a time per user ----
export const dispatchDueMonitoringJobs = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const { data: due } = await supabaseAdmin
      .from("monitoring_jobs")
      .select("*")
      .eq("status", "active")
      .lte("next_run_at", now)
      .order("next_run_at", { ascending: true })
      .limit(50);

    if (!due || due.length === 0) return { dispatched: 0 };

    // Group by user and only dispatch when that user has no active task.
    const byUser = new Map<string, any[]>();
    for (const j of due) {
      const arr = byUser.get(j.user_id) ?? [];
      arr.push(j);
      byUser.set(j.user_id, arr);
    }

    let dispatched = 0;
    for (const [userId, jobs] of byUser) {
      const { count } = await supabaseAdmin
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["queued", "running", "browsing", "navigating", "extracting", "analyzing"]);
      if ((count ?? 0) > 0) continue; // honor 1-active limit
      const job = jobs[0];
      const enq = await enqueueViaWorker({
        type: job.worker_task_type,
        input: { ...(job.config ?? {}), monitoringJobId: job.id },
      });
      if (enq.offline) continue;
      await supabaseAdmin.from("agent_tasks").upsert(
        {
          user_id: userId,
          worker_task_id: enq.task.id,
          type: enq.task.type,
          status: enq.task.status,
          input: enq.task.input ?? {},
        },
        { onConflict: "user_id,worker_task_id" },
      );
      await supabaseAdmin
        .from("monitoring_jobs")
        .update({
          last_run_at: now,
          last_worker_task_id: enq.task.id,
          run_count: (job.run_count ?? 0) + 1,
          next_run_at: nextRunFor(job.frequency).toISOString(),
        })
        .eq("id", job.id);
      dispatched++;
    }

    return { dispatched };
  });
