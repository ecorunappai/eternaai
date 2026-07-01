// Server-only: post-completion analyzer for image.reverse / web.search tasks.
// Flow: agent_task hits -> AI classification -> discovered_matches (Evidence Vault)
//       -> high-risk hits get an enforcement_case draft (Warning / Takedown package).

type SupabaseLike = {
  from: (table: string) => any;
};

interface Hit {
  url?: string;
  title?: string;
  snippet?: string;
  platform?: string;
  query?: string;
  screenshot?: string | null;
  host?: string;
  provider?: string;
  reason?: string;
}

interface Task {
  id: string;
  type: string;
  input?: Record<string, unknown> | null;
  extracted?: Record<string, unknown> | null;
}

function scoreToRisk(s: number) {
  return s >= 75 ? "critical" : s >= 55 ? "high" : s >= 35 ? "medium" : "low";
}

async function classifyHits(assetName: string, hits: Hit[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  const fallback = hits.map((h) => ({ ...h, risk_score: 40, category: "monitor", action: "monitor" }));
  if (!apiKey || !hits.length) return fallback;

  try {
    const prompt = `You are a brand-protection analyst. For each result classify:
- category: impersonation | copyright_copy | reputation_attack | fake_account | reaction_video | defamatory | brand_misuse | benign
- risk_score: 0-100 integer
- action: monitor | warning_email | takedown
Return strict JSON: {"results":[{"url":"...","category":"...","risk_score":0,"action":"..."}]}
Target: ${assetName}
Results:
${JSON.stringify(hits.map((h) => ({
  url: h.url, title: h.title, snippet: h.snippet,
  platform: h.platform, host: h.host, provider: h.provider,
})).slice(0, 30))}`;

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
    if (!r.ok) return fallback;
    const json = await r.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const results: any[] = Array.isArray(parsed.results) ? parsed.results : [];
    return hits.map((h) => {
      const m = results.find((x) => x.url === h.url);
      const score = Math.max(0, Math.min(100, Number(m?.risk_score ?? 40)));
      return {
        ...h,
        category: m?.category ?? "monitor",
        risk_score: score,
        action: m?.action ?? (score >= 55 ? "warning_email" : "monitor"),
      };
    });
  } catch (e) {
    console.warn("classifyHits AI failed", (e as Error).message);
    return fallback;
  }
}

export async function analyzeCompletedAgentTask(
  supabase: SupabaseLike,
  userId: string,
  task: Task,
) {
  const extracted = (task.extracted ?? {}) as Record<string, any>;
  const hits: Hit[] = Array.isArray(extracted.hits) ? extracted.hits
    : Array.isArray(extracted.evidence) ? extracted.evidence
    : [];
  if (!hits.length) return { classified: 0 };

  // Resolve target asset: input.assetId, else the monitoring job's asset.
  const input = (task.input ?? {}) as Record<string, any>;
  let assetId: string | undefined = input.assetId;
  let assetName: string = input.assetName ?? "";

  if (!assetId && input.monitoringJobId) {
    const { data: job } = await supabase
      .from("monitoring_jobs")
      .select("asset_id, asset_name")
      .eq("id", input.monitoringJobId)
      .maybeSingle();
    if (job) {
      assetId = job.asset_id ?? undefined;
      assetName = assetName || job.asset_name || "";
    }
  }
  if (!assetId) {
    const { data: firstAsset } = await supabase
      .from("assets")
      .select("id, title")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    assetId = firstAsset?.id;
    assetName = assetName || firstAsset?.title || "";
  }
  if (!assetId) return { classified: 0, reason: "no_asset" };

  const classified = await classifyHits(assetName, hits);

  const rows = classified.map((h) => ({
    user_id: userId,
    asset_id: assetId as string,
    source_url: String(h.url ?? ""),
    video_title: (h.title ?? "").slice(0, 500),
    platform: h.platform ?? h.provider ?? "web",
    preview_url: h.screenshot ?? null,
    notes: (h.snippet ?? h.reason ?? h.query ?? "").slice(0, 1000),
    discovered_via: task.type === "image.reverse" ? "reverse_image" : "browser_agent",
    ai_score: h.risk_score,
    final_confidence_score: h.risk_score,
    violation_category: h.category,
    result_category: h.action,
    risk_level: scoreToRisk(h.risk_score),
    status: "pending",
  }));

  const { data: inserted, error } = await supabase
    .from("discovered_matches")
    .insert(rows)
    .select("id, source_url, risk_level, result_category");
  if (error) {
    console.warn("insert discovered_matches", error.message);
    return { classified: 0, reason: error.message };
  }

  // Auto-draft an enforcement case for warning_email / takedown hits.
  const actionable = (inserted ?? []).filter(
    (r: any) => r.result_category === "warning_email" || r.result_category === "takedown",
  );
  if (actionable.length) {
    const caseRows = actionable.map((r: any) => ({
      user_id: userId,
      asset_id: assetId as string,
      match_id: r.id,
      source_url: r.source_url,
      stage: r.result_category === "takedown" ? "takedown_ready" : "warning_ready",
      status: "draft",
      priority: r.risk_level === "critical" ? "urgent" : r.risk_level === "high" ? "high" : "normal",
    }));
    const { error: caseErr } = await supabase.from("enforcement_cases").insert(caseRows);
    if (caseErr) console.warn("insert enforcement_cases", caseErr.message);
  }

  // Mark the task as analyzed to prevent duplicate runs.
  await supabase
    .from("agent_tasks")
    .update({ status: "analyzed" })
    .eq("user_id", userId)
    .eq("worker_task_id", task.id);

  return { classified: rows.length, actionable: actionable.length };
}
