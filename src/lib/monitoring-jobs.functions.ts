// Eterna AI — Auto-monitoring jobs created from the Content Registry.
// Each registered asset spawns a set of recurring browser-agent scans
// (YouTube latest, troll/reaction/expose, Instagram impersonation, Google
// web search, weekly content misuse). A scheduler dispatches due jobs,
// honoring the worker's 1-active-task concurrency limit.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Browser Agent only accepts these task types. General "web scan" work is
// split into separate youtube.investigate + instagram.investigate +
// contact.discover jobs rather than a single web.search task.
const ALLOWED_WORKER_TYPES = [
  "youtube.investigate",
  "instagram.investigate",
  "contact.discover",
  "email.prepare",
  "takedown.prepare",
  "image.reverse",
] as const;

type BuiltJob = {
  scan_type: string;
  worker_task_type: (typeof ALLOWED_WORKER_TYPES)[number];
  frequency: "daily" | "weekly" | "once";
  input: Record<string, unknown>;
};

function buildScanJobs(p: ProtectionProfile): BuiltJob[] {
  const jobs: BuiltJob[] = [];
  const igUser = usernameFromUrl(p.officialInstagramUrl);
  const ytUser = usernameFromUrl(p.officialYoutubeUrl);

  if (p.officialYoutubeUrl) {
    jobs.push({
      scan_type: "youtube_channel_scan",
      worker_task_type: "youtube.investigate",
      frequency: "daily",
      input: {
        channelUrl: p.officialYoutubeUrl,
        name: p.creatorName,
        keywords: p.keywords,
        source: "content_registry",
        assetName: p.creatorName,
      },
    });
  }

  if (p.officialInstagramUrl) {
    jobs.push({
      scan_type: "instagram_profile_scan",
      worker_task_type: "instagram.investigate",
      frequency: "daily",
      input: {
        profileUrl: p.officialInstagramUrl,
        name: p.creatorName,
        keywords: p.keywords,
        source: "content_registry",
        assetName: p.creatorName,
      },
    });
  }

  jobs.push({
    scan_type: "contact_discovery",
    worker_task_type: "contact.discover",
    frequency: "weekly",
    input: {
      name: p.creatorName,
      channelUrl: p.officialYoutubeUrl ?? undefined,
      socialLinks: [p.officialInstagramUrl, p.officialYoutubeUrl].filter(Boolean) as string[],
      username: igUser || ytUser,
      keywords: p.keywords,
      source: "content_registry",
      assetName: p.creatorName,
    },
  });

  return jobs;
}

// Reverse-image job — only attached when we have an actual image asset.
// The `imageUrl` is signed at dispatch time from asset.storage_path.
const IMAGE_REVERSE_JOB: BuiltJob = {
  scan_type: "image_reverse_daily",
  worker_task_type: "image.reverse",
  frequency: "daily",
  input: {
    providers: ["google_lens", "bing_visual", "yandex_images"],
    source: "content_registry",
  },
};


function usernameFromUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    const seg = url.pathname.replace(/^\//, "").split("/")[0] || "";
    return seg.replace(/^@/, "") || undefined;
  } catch { return undefined; }
}

type ProtectionProfile = {
  creatorName: string;
  officialYoutubeUrl?: string | null;
  officialInstagramUrl?: string | null;
  keywords?: string[];
  issueTypes?: string[];
};

function nextRunFor(frequency: string, from = new Date()): Date | null {
  if (frequency === "once") return null;
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

    const built: BuiltJob[] = buildScanJobs({
      creatorName: data.creatorName,
      officialYoutubeUrl: data.officialYoutubeUrl,
      officialInstagramUrl: data.officialInstagramUrl,
      keywords: data.keywords,
      issueTypes: data.issueTypes,
    });

    // If this asset is an image, add a recurring reverse-image scan (Google Lens → Bing → Yandex).
    if (data.assetId) {
      const { data: asset } = await supabase
        .from("assets")
        .select("asset_type,storage_path")
        .eq("id", data.assetId)
        .maybeSingle();
      if (asset?.asset_type === "image" && asset.storage_path) {
        built.push({
          ...IMAGE_REVERSE_JOB,
          input: { ...IMAGE_REVERSE_JOB.input, assetName: data.creatorName },
        });
      }
    }

    const rows = built.map((t) => ({
      user_id: userId,
      asset_id: data.assetId ?? null,
      profile_id: profile.id,
      source: "content_registry",
      asset_name: data.creatorName,
      scan_type: t.scan_type,
      worker_task_type: t.worker_task_type,
      frequency: t.frequency,
      status: "active",
      config: t.input as any,
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
// Distinguishes network/offline failures from 400 payload validation errors.
type EnqueueResult =
  | { ok: true; task: any }
  | { ok: false; kind: "offline"; reason: string }
  | { ok: false; kind: "invalid"; reason: string; status: number };

async function enqueueViaWorker(input: {
  type: string;
  input: Record<string, unknown>;
}): Promise<EnqueueResult> {
  const baseUrl = process.env.BROWSER_AGENT_URL;
  const token = process.env.BROWSER_AGENT_TOKEN ?? "";
  if (!baseUrl) return { ok: false, kind: "offline", reason: "BROWSER_AGENT_URL not configured" };
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
    if (res.ok) {
      const body = (await res.json()) as { task: any };
      return { ok: true, task: body.task };
    }
    // Read exact error body — surface as invalid payload for 4xx, offline otherwise.
    const raw = await res.text().catch(() => "");
    let detail = raw.slice(0, 300);
    try {
      const j = JSON.parse(raw);
      detail = j.error ?? j.message ?? detail;
    } catch { /* keep raw */ }
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, kind: "invalid", status: res.status, reason: detail || `HTTP ${res.status}` };
    }
    return { ok: false, kind: "offline", reason: `Agent HTTP ${res.status}: ${detail}` };
  } catch (e) {
    return { ok: false, kind: "offline", reason: (e as Error).message };
  }
}

// Validate the worker task payload BEFORE dispatch to catch missing fields early
// and return a precise message ("imageUrl is required") instead of a generic 400.
function validateWorkerPayload(
  workerTaskType: string,
  scanType: string,
  input: Record<string, unknown>,
): { ok: true } | { ok: false; missingField: string; reason: string } {
  const need = (f: string) => {
    const v = input[f];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  };
  if (workerTaskType === "image.reverse") {
    if (need("imageUrl")) return { ok: false, missingField: "imageUrl", reason: `Missing required field "imageUrl" for scan "${scanType}" (image.reverse). Ensure the asset has a stored image file.` };
    return { ok: true };
  }
  if (!ALLOWED_WORKER_TYPES.includes(workerTaskType as any)) {
    return { ok: false, missingField: "type", reason: `Invalid task type "${workerTaskType}". Allowed: ${ALLOWED_WORKER_TYPES.join(", ")}.` };
  }
  if (workerTaskType === "youtube.investigate" || workerTaskType === "instagram.investigate") {
    const urlField = workerTaskType === "youtube.investigate" ? "channelUrl" : "profileUrl";
    if (need(urlField) && need("videoUrl") && need("postUrl") && need("url")) {
      return { ok: false, missingField: urlField, reason: `Missing "${urlField}" (or url) for scan "${scanType}".` };
    }
    return { ok: true };
  }
  return { ok: true };
}

// Build the runner input for a job, signing a fresh image URL for image.reverse tasks.
async function buildJobInput(
  supabase: any,
  job: any,
): Promise<Record<string, unknown> | { error: string }> {
  const base = { ...((job.config ?? {}) as Record<string, unknown>), monitoringJobId: job.id };
  if (job.worker_task_type !== "image.reverse") return base;
  if (!job.asset_id) return { error: "image.reverse job missing asset_id" };
  const { data: asset } = await supabase
    .from("assets")
    .select("id,storage_path,title,asset_type")
    .eq("id", job.asset_id)
    .maybeSingle();
  if (!asset?.storage_path) return { error: "asset has no storage_path" };
  const { data: signed } = await supabase.storage
    .from("assets")
    .createSignedUrl(asset.storage_path, 60 * 60 * 24);
  if (!signed?.signedUrl) return { error: "could not sign asset URL" };
  return { ...base, imageUrl: signed.signedUrl, assetId: asset.id, assetName: asset.title ?? "" };
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

    const built = await buildJobInput(supabase, job);
    if ("error" in built && typeof built.error === "string") {
      return { offline: false, invalid: true, reason: built.error, missingField: "asset", queued: (activeCount ?? 0) > 0 };
    }
    const payload = built as Record<string, unknown>;

    // Pre-flight validation — surfaces missing fields as invalid, not offline.
    const check = validateWorkerPayload(job.worker_task_type, job.scan_type, payload);
    if (!check.ok) {
      return { offline: false, invalid: true, reason: check.reason, missingField: check.missingField, queued: (activeCount ?? 0) > 0 };
    }

    const enq = await enqueueViaWorker({ type: job.worker_task_type, input: payload });

    if (!enq.ok && enq.kind === "invalid") {
      return { offline: false, invalid: true, reason: enq.reason, status: enq.status, queued: (activeCount ?? 0) > 0 };
    }
    if (!enq.ok) {
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

    const next = nextRunFor(job.frequency);
    await supabase
      .from("monitoring_jobs")
      .update({
        last_run_at: new Date().toISOString(),
        last_worker_task_id: enq.task.id,
        run_count: (job.run_count ?? 0) + 1,
        next_run_at: next ? next.toISOString() : new Date(Date.now() + 365 * 86400_000).toISOString(),
        status: next ? job.status : "completed",
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
      const built = await buildJobInput(supabaseAdmin, job);
      if ("error" in built && typeof (built as any).error === "string") continue;
      const payload = built as Record<string, unknown>;
      const check = validateWorkerPayload(job.worker_task_type, job.scan_type, payload);
      if (!check.ok) continue;
      const enq = await enqueueViaWorker({ type: job.worker_task_type, input: payload });
      if (!enq.ok) continue;
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
      const next = nextRunFor(job.frequency);
      await supabaseAdmin
        .from("monitoring_jobs")
        .update({
          last_run_at: now,
          last_worker_task_id: enq.task.id,
          run_count: (job.run_count ?? 0) + 1,
          next_run_at: next ? next.toISOString() : new Date(Date.now() + 365 * 86400_000).toISOString(),
          status: next ? job.status : "completed",
        })
        .eq("id", job.id);
      dispatched++;
    }

    return { dispatched };
  });

// ---------------------------------------------------------------
// AI Risk Analyzer — reads an agent_task's extracted hits/evidence
// and creates classified `discovered_matches` rows with risk score,
// category, and suggested action. Uses Lovable AI Gateway.
// ---------------------------------------------------------------
export const analyzeAgentTaskResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      workerTaskId: z.string().min(1),
      assetId: z.string().uuid().optional(),
      assetName: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("worker_task_id", data.workerTaskId)
      .maybeSingle();
    if (!row) throw new Error("Task not found");

    const extracted = (row.extracted ?? {}) as Record<string, any>;
    const hits: any[] = Array.isArray(extracted.evidence) && extracted.evidence.length
      ? extracted.evidence
      : Array.isArray(extracted.hits) ? extracted.hits : [];
    if (!hits.length) return { classified: 0 };

    const apiKey = process.env.LOVABLE_API_KEY;
    let ai: any[] = hits.map((h) => ({ ...h, risk_score: 40, category: "monitor", action: "monitor" }));

    if (apiKey) {
      try {
        const prompt = `You are a brand-protection analyst. For each result, classify:
- category: one of impersonation, copyright_copy, reputation_attack, fake_account, reaction_video, defamatory, brand_misuse, benign
- risk_score: 0-100 integer
- action: monitor | warning_email | takedown
Return strict JSON: {"results":[{"url":"...","category":"...","risk_score":0,"action":"..."}]}
Target: ${data.assetName ?? ""}
Results:
${JSON.stringify(hits.map((h) => ({ url: h.url, title: h.title, snippet: h.snippet, platform: h.platform, query: h.query })).slice(0, 25))}`;

        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (r.ok) {
          const json = await r.json();
          const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
          const results: any[] = Array.isArray(parsed.results) ? parsed.results : [];
          ai = hits.map((h) => {
            const m = results.find((x) => x.url === h.url);
            return {
              ...h,
              category: m?.category ?? "monitor",
              risk_score: Math.max(0, Math.min(100, Number(m?.risk_score ?? 40))),
              action: m?.action ?? "monitor",
            };
          });
        }
      } catch (e) {
        console.warn("AI classification failed", (e as Error).message);
      }
    }

    let assetId = data.assetId;
    if (!assetId) {
      const { data: firstAsset } = await supabase
        .from("assets")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      assetId = firstAsset?.id;
    }
    if (!assetId) return { classified: 0, reason: "no_asset" };

    const scoreToRisk = (s: number) =>
      s >= 75 ? "critical" : s >= 55 ? "high" : s >= 35 ? "medium" : "low";

    const rows = ai.map((h) => ({
      user_id: userId,
      asset_id: assetId as string,
      source_url: String(h.url ?? ""),
      video_title: (h.title ?? "").slice(0, 500),
      platform: h.platform ?? "web",
      preview_url: h.screenshot ?? null,
      notes: (h.snippet ?? h.reason ?? h.query ?? "").slice(0, 1000),
      discovered_via: "browser_agent",
      ai_score: h.risk_score,
      final_confidence_score: h.risk_score,
      violation_category: h.category,
      result_category: h.action,
      risk_level: scoreToRisk(h.risk_score),
      status: "pending",
    }));

    const { error } = await supabase.from("discovered_matches").insert(rows);
    if (error) console.warn("insert discovered_matches", error.message);
    return { classified: rows.length };
  });
