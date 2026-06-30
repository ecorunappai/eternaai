import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot, Loader2, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Camera, Plus,
  Search, UserSearch, Youtube, Instagram, Mail, Gavel, Eye, Copy, Ghost,
  Brain, Activity, ShieldCheck, ListChecks, Sparkles, Zap, Hand, Cog,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth";
import {
  enqueueAgentTask,
  getAgentTask,
  listAgentTasks,
  approveAgentTask,
  cancelAgentTask,
  browserAgentStatus,
} from "@/lib/browser-agent-client.functions";

export const Route = createFileRoute("/agent-console")({
  head: () => ({ meta: [{ title: "Agent Console — Eterna AI" }] }),
  component: AgentConsolePage,
});

// ---------- Status mapping (UI-side enrichment over worker statuses) ----------
const STATUS_TONE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-500/10 text-blue-700",
  browser_opened: "bg-blue-500/10 text-blue-700",
  browsing: "bg-blue-500/10 text-blue-700",
  navigating: "bg-blue-500/10 text-blue-700",
  extracting: "bg-indigo-500/10 text-indigo-700",
  analyzing: "bg-indigo-500/10 text-indigo-700",
  finding_contacts: "bg-fuchsia-500/10 text-fuchsia-700",
  evidence_captured: "bg-indigo-500/10 text-indigo-700",
  capturing_evidence: "bg-indigo-500/10 text-indigo-700",
  contact_found: "bg-emerald-500/10 text-emerald-700",
  email_drafted: "bg-amber-500/10 text-amber-700",
  form_prepared: "bg-amber-500/10 text-amber-700",
  generating_report: "bg-amber-500/10 text-amber-700",
  waiting_approval: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-700",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

// Map "fancy" UI status from worker phase/status for richer feedback.
function uiStatus(task: any): string {
  const s = task?.status as string | undefined;
  const last = (task?.steps ?? [])[(task?.steps?.length ?? 0) - 1];
  const phase: string | undefined = last?.phase;
  if (!s) return "queued";
  if (phase === "extract") return "extracting";
  if (phase === "contact") return "finding_contacts";
  if (phase === "screenshot") return "capturing_evidence";
  if (phase === "analyze") return "analyzing";
  if (phase === "report") return "generating_report";
  return s;
}

// ---------- Task type catalogue (UI) ----------
type TaskTypeDef = {
  v: string;                // UI key
  worker: string | "composite";
  label: string;
  short: string;
  icon: any;
  hint: string;
  fields: { k: string; label: string; placeholder?: string; required?: boolean }[];
  // For composite tasks: returns an array of {worker, input} sub-tasks
  expand?: (input: Record<string, any>) => { worker: string; input: Record<string, any>; label: string }[];
};

const TASK_TYPES: TaskTypeDef[] = [
  {
    v: "investigate_creator",
    worker: "composite",
    label: "Investigate Creator",
    short: "Full creator intelligence report",
    icon: UserSearch,
    hint: "Searches YouTube, Instagram, Facebook, TikTok and discovers contact details automatically.",
    fields: [
      { k: "name", label: "Creator name", placeholder: "e.g. Jane Doe", required: true },
      { k: "websiteUrl", label: "Known website (optional)", placeholder: "https://janedoe.com" },
    ],
    expand: (input) => {
      const name = input.name as string;
      const subs = [
        { worker: "youtube.investigate", input: { query: name }, label: `YouTube — ${name}` },
        { worker: "youtube.investigate", input: { query: `${name} reaction` }, label: `YouTube reactions — ${name}` },
        { worker: "youtube.investigate", input: { query: `${name} troll` }, label: `YouTube trolls — ${name}` },
        { worker: "instagram.investigate", input: { profileUrl: `https://www.instagram.com/${slug(name)}/` }, label: `Instagram — ${name}` },
        { worker: "contact.discover", input: {
            name,
            websiteUrl: input.websiteUrl || undefined,
            socialLinks: [
              `https://www.instagram.com/${slug(name)}/`,
              `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`,
              `https://www.tiktok.com/@${slug(name)}`,
              `https://www.facebook.com/${slug(name)}`,
            ],
          }, label: `Contact discovery — ${name}` },
      ];
      return subs;
    },
  },
  {
    v: "contact.discover",
    worker: "contact.discover",
    label: "Find Contact Details",
    short: "Emails, contact forms, socials",
    icon: Mail,
    hint: "Crawls website, Linktree/Beacons, and known socials for public contact info.",
    fields: [
      { k: "websiteUrl", label: "Website URL", placeholder: "https://example.com" },
      { k: "socialLinks", label: "Social links (comma-separated)", placeholder: "https://linktr.ee/…, https://x.com/…" },
    ],
  },
  {
    v: "youtube.investigate",
    worker: "youtube.investigate",
    label: "Analyze YouTube Channel",
    short: "Search → channel → About → links",
    icon: Youtube,
    hint: "Drives a real Playwright session through search, video, channel and About pages.",
    fields: [
      { k: "query", label: "Creator name / search query", placeholder: "e.g. Jane Doe" },
      { k: "channelUrl", label: "Channel URL (optional)", placeholder: "https://youtube.com/@…" },
    ],
  },
  {
    v: "instagram.investigate",
    worker: "instagram.investigate",
    label: "Analyze Instagram Profile",
    short: "Bio, external links, fake-account hints",
    icon: Instagram,
    hint: "Opens a public profile, scans bio/links, flags reupload/impersonation patterns.",
    fields: [
      { k: "profileUrl", label: "Public profile URL", placeholder: "https://instagram.com/username", required: true },
    ],
  },
  {
    v: "collect_evidence",
    worker: "youtube.investigate",
    label: "Collect Evidence",
    short: "Capture & save screenshots",
    icon: Camera,
    hint: "Opens the URL, records metadata, and stores screenshots into the evidence vault.",
    fields: [
      { k: "channelUrl", label: "URL to capture", placeholder: "https://youtube.com/watch?v=…", required: true },
    ],
  },
  {
    v: "email.prepare",
    worker: "email.prepare",
    label: "Prepare Warning Email",
    short: "Draft a polite removal request",
    icon: Mail,
    hint: "Generates a firm, lawful warning email. Halts at manager approval — never auto-sends.",
    fields: [
      { k: "recipientEmail", label: "Recipient email", placeholder: "creator@example.com", required: true },
      { k: "subjectName", label: "Rights holder name", placeholder: "Jane Doe", required: true },
      { k: "targetUrl", label: "Infringing URL", placeholder: "https://youtube.com/watch?v=…", required: true },
      { k: "evidenceLinks", label: "Evidence URLs (comma-separated)" },
      { k: "deadlineHours", label: "Deadline (hours)", placeholder: "72" },
    ],
  },
  {
    v: "takedown.prepare",
    worker: "takedown.prepare",
    label: "Prepare Takedown Package",
    short: "Pre-fill the platform's report form",
    icon: Gavel,
    hint: "Opens the platform report page, pre-fills fields, captures snapshot. Halts before submit.",
    fields: [
      { k: "platform", label: "Platform", placeholder: "youtube | instagram | tiktok | x | facebook", required: true },
      { k: "targetUrl", label: "Infringing URL", placeholder: "https://…", required: true },
      { k: "originalUrl", label: "Original work URL", placeholder: "https://…" },
      { k: "rightsOwnerName", label: "Rights owner name", placeholder: "Jane Doe", required: true },
      { k: "signature", label: "Authorized signature (typed name)", placeholder: "Jane Doe", required: true },
      { k: "evidenceLinks", label: "Evidence URLs (comma-separated)" },
    ],
  },
  {
    v: "monitor_creator",
    worker: "composite",
    label: "Monitor Creator",
    short: "Recurring multi-platform scan",
    icon: Eye,
    hint: "Schedules a recurring intelligence pass across YouTube + Instagram.",
    fields: [
      { k: "name", label: "Creator name", placeholder: "e.g. Jane Doe", required: true },
    ],
    expand: (input) => [
      { worker: "youtube.investigate", input: { query: input.name }, label: `Monitor — YouTube ${input.name}` },
      { worker: "instagram.investigate", input: { profileUrl: `https://www.instagram.com/${slug(input.name as string)}/` }, label: `Monitor — Instagram ${input.name}` },
    ],
  },
  {
    v: "find_reuploads",
    worker: "composite",
    label: "Find Reuploads",
    short: "Hunt unauthorized reposts",
    icon: Copy,
    hint: "Searches YouTube for reuploads/clips/edits of the named creator's content.",
    fields: [
      { k: "name", label: "Creator name", placeholder: "e.g. Jane Doe", required: true },
    ],
    expand: (input) => [
      { worker: "youtube.investigate", input: { query: `${input.name} reupload` }, label: `Reuploads — ${input.name}` },
      { worker: "youtube.investigate", input: { query: `${input.name} full video` }, label: `Full video copies — ${input.name}` },
      { worker: "youtube.investigate", input: { query: `${input.name} clips` }, label: `Clips — ${input.name}` },
    ],
  },
  {
    v: "find_fake_profiles",
    worker: "composite",
    label: "Find Fake Profiles",
    short: "Impersonation & deepfake hunt",
    icon: Ghost,
    hint: "Crawls Instagram & YouTube variants of the name to surface impersonation accounts.",
    fields: [
      { k: "name", label: "Creator name", placeholder: "e.g. Jane Doe", required: true },
    ],
    expand: (input) => {
      const n = input.name as string;
      const s = slug(n);
      return [
        { worker: "instagram.investigate", input: { profileUrl: `https://www.instagram.com/${s}_official/` }, label: `Fake — ${s}_official` },
        { worker: "instagram.investigate", input: { profileUrl: `https://www.instagram.com/${s}.real/` }, label: `Fake — ${s}.real` },
        { worker: "instagram.investigate", input: { profileUrl: `https://www.instagram.com/${s}_fanpage/` }, label: `Fan page — ${s}` },
        { worker: "youtube.investigate", input: { query: `${n} fake account` }, label: `YouTube — fake ${n}` },
      ];
    },
  },
];

function slug(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30) || "user";
}
function findType(v?: string) {
  return TASK_TYPES.find((t) => t.v === v) || TASK_TYPES.find((t) => t.v === v?.replace(".", "_"));
}
function labelForWorkerType(workerType: string) {
  const direct = TASK_TYPES.find((t) => t.worker === workerType);
  return direct?.label ?? workerType;
}

type AgentMode = "manual" | "semi" | "autonomous";
const MODE_KEY = "eterna.agent.mode";

function AgentConsolePage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<any | null>(null);
  const [agentOnline, setAgentOnline] = useState<{ online: boolean; configured: boolean; reason?: string; code?: string; latencyMs?: number } | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>(() => (typeof window !== "undefined" && (localStorage.getItem(MODE_KEY) as AgentMode)) || "semi");
  const [filter, setFilter] = useState<string>("all");
  const pollRef = useRef<number | null>(null);

  const enqueue = useServerFn(enqueueAgentTask);
  const getOne = useServerFn(getAgentTask);
  const listAll = useServerFn(listAgentTasks);
  const approve = useServerFn(approveAgentTask);
  const cancel = useServerFn(cancelAgentTask);
  const status = useServerFn(browserAgentStatus);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  async function refreshList() {
    try {
      const r = await listAll();
      setTasks(r.tasks);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!user) return;
    refreshList();
    status().then(setAgentOnline).catch(() => setAgentOnline({ online: false, configured: false, code: "probe_failed", reason: "probe failed" }));
    const t = window.setInterval(refreshList, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedId) { setCurrent(null); return; }
    let stop = false;
    async function tick() {
      try {
        const r = await getOne({ data: { workerTaskId: selectedId! } });
        if (!stop) setCurrent((r as any).task);
      } catch { /* ignore */ }
    }
    tick();
    pollRef.current = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tasks.length, running: 0, waiting_approval: 0, completed: 0, failed: 0 };
    for (const t of tasks) {
      const s = t.status;
      if (["queued", "browser_opened", "navigating", "extracting", "evidence_captured", "contact_found", "email_drafted", "form_prepared"].includes(s)) c.running++;
      else if (s === "waiting_approval") c.waiting_approval++;
      else if (s === "completed") c.completed++;
      else if (s === "failed" || s === "cancelled") c.failed++;
    }
    return c;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "running") return tasks.filter((t) => !["completed", "failed", "cancelled", "waiting_approval"].includes(t.status));
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  async function onApprove() {
    if (!current) return;
    setBusy("approve");
    try {
      const r = await approve({ data: { workerTaskId: current.worker_task_id ?? current.id } });
      if ((r as any).offline) toast.error((r as any).reason);
      else toast.success("Approved");
      await refreshList();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }
  async function onCancel() {
    if (!current) return;
    setBusy("cancel");
    try {
      await cancel({ data: { workerTaskId: current.worker_task_id ?? current.id } });
      toast.message("Task cancelled");
      await refreshList();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <AppShell title="Agent Console">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> Agent Console</h1>
          <p className="text-sm text-muted-foreground">Command center for autonomous browser workflows. Public pages only. Legal complaints never auto-submit.</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeSwitcher mode={mode} setMode={setMode} />
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
            <Plus className="h-4 w-4" /> New Task
          </button>
        </div>
      </div>

      {/* Status banner */}
      {agentOnline && !agentOnline.online && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700">
          <strong>Browser Agent offline.</strong> Showing persisted history only.
          {agentOnline.configured ? ` (${agentOnline.reason})` : " Configure BROWSER_AGENT_URL + BROWSER_AGENT_TOKEN to enable live runs."}
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Total" value={counts.all} icon={ListChecks} active={filter === "all"} onClick={() => setFilter("all")} />
        <Kpi label="Running" value={counts.running} icon={Activity} tone="text-blue-700" active={filter === "running"} onClick={() => setFilter("running")} />
        <Kpi label="Awaiting Approval" value={counts.waiting_approval} icon={Hand} tone="text-primary" active={filter === "waiting_approval"} onClick={() => setFilter("waiting_approval")} />
        <Kpi label="Completed" value={counts.completed} icon={CheckCircle2} tone="text-emerald-700" active={filter === "completed"} onClick={() => setFilter("completed")} />
        <Kpi label="Failed" value={counts.failed} icon={XCircle} tone="text-destructive" active={filter === "failed"} onClick={() => setFilter("failed")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_340px] gap-4">
        {/* Queue */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Task Queue ({filteredTasks.length})</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] normal-case">{filter}</span>
          </div>
          <ul className="max-h-[680px] overflow-y-auto divide-y divide-border">
            {filteredTasks.length === 0 && <li className="p-4 text-xs text-muted-foreground">No tasks. Click "New Task" to launch the agent.</li>}
            {filteredTasks.map((t) => {
              const id = t.worker_task_id ?? t.id;
              const active = selectedId === id;
              const ui = uiStatus(t);
              const tone = STATUS_TONE[ui] ?? "bg-muted";
              return (
                <li key={t.id}>
                  <button onClick={() => setSelectedId(id)} className={`w-full text-left p-3 ${active ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/30"}`}>
                    <div className="text-xs font-medium line-clamp-1">{labelForWorkerType(t.type)}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{t.next_action ?? t.input?.query ?? t.input?.profileUrl ?? t.input?.channelUrl ?? t.input?.name ?? ""}</div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${tone}`}>{ui.replace(/_/g, " ")}</span>
                      <span className="text-[9px] text-muted-foreground ml-auto">{new Date(t.created_at ?? Date.now()).toLocaleTimeString()}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Center: Live session + Activity feed */}
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card min-h-[420px]">
            {!current ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <Bot className="mx-auto h-10 w-10 mb-2" />
                Select a task to view the live browser session.
              </div>
            ) : (
              <LiveSession task={current} busy={busy} onApprove={onApprove} onCancel={onCancel} mode={mode} />
            )}
          </div>

          {/* Activity feed */}
          <ActivityFeed task={current} />
        </section>

        {/* Right: Thoughts + Extracted + Evidence */}
        <section className="space-y-4">
          <ThoughtsPanel task={current} />
          <ExtractedSection task={current} />
          <EvidencePanel task={current} />
        </section>
      </div>

      {showNew && (
        <NewTaskDialog
          onClose={() => setShowNew(false)}
          onCreated={async (id) => { setShowNew(false); await refreshList(); if (id) setSelectedId(id); }}
          enqueue={enqueue}
        />
      )}
    </AppShell>
  );
}

// ---------- Mode switcher ----------
function ModeSwitcher({ mode, setMode }: { mode: AgentMode; setMode: (m: AgentMode) => void }) {
  const opts: { v: AgentMode; label: string; icon: any; hint: string }[] = [
    { v: "manual", label: "Manual", icon: Hand, hint: "Confirm before every action" },
    { v: "semi", label: "Semi", icon: Cog, hint: "Confirm only risky actions" },
    { v: "autonomous", label: "Auto", icon: Zap, hint: "Run end-to-end without prompts" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
      {opts.map((o) => {
        const Icon = o.icon;
        const active = mode === o.v;
        return (
          <button
            key={o.v}
            title={o.hint}
            onClick={() => setMode(o.v)}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- KPI tile ----------
function Kpi({ label, value, icon: Icon, tone, active, onClick }: { label: string; value: number; icon: any; tone?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition ${active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"}`}
    >
      <Icon className={`h-4 w-4 ${tone ?? "text-muted-foreground"}`} />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div>
      </div>
    </button>
  );
}

// ---------- Live session ----------
function LiveSession({ task, busy, onApprove, onCancel, mode }: { task: any; busy: string | null; onApprove: () => void; onCancel: () => void; mode: AgentMode }) {
  const steps: any[] = task.steps ?? [];
  const last = steps[steps.length - 1];
  const screenshots: string[] = task.screenshots ?? [];
  const lastShot = screenshots[screenshots.length - 1];
  const ui = uiStatus(task);
  const tone = STATUS_TONE[ui] ?? "bg-muted";
  const showApproval = task.status === "waiting_approval" || (mode !== "autonomous" && task.status === "form_prepared");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{labelForWorkerType(task.type)}</div>
          <div className="text-xs text-muted-foreground truncate">{last?.url ?? task.next_action ?? task.nextAction ?? ""}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{ui.replace(/_/g, " ")}</span>
      </div>

      {showApproval && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-semibold text-primary">Awaiting manager approval</div>
            <div className="text-muted-foreground">{task.next_action ?? task.nextAction}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={busy === "cancel"} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50">
              {busy === "cancel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Cancel
            </button>
            <button onClick={onApprove} disabled={busy === "approve"} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
              {busy === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve
            </button>
          </div>
        </div>
      )}

      {/* Live browser frame */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-red-500" /><span className="inline-flex h-2 w-2 rounded-full bg-amber-500" /><span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          <Camera className="h-3 w-3 ml-2" />
          <span>Live browser session</span>
          {last?.url && (
            <a href={last.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary normal-case">
              <ExternalLink className="h-2.5 w-2.5" /> open
            </a>
          )}
        </div>
        {lastShot ? (
          <img src={lastShot} alt="latest" className="w-full max-h-[360px] object-contain bg-black/5" />
        ) : (
          <div className="p-10 text-center text-xs text-muted-foreground">
            {task.status === "queued" ? "Queued — waiting for a worker slot…" : "Capturing first frame…"}
          </div>
        )}
      </div>

      {task.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" /> {task.error}
        </div>
      )}
    </div>
  );
}

// ---------- Activity feed (timeline) ----------
function ActivityFeed({ task }: { task: any }) {
  const steps: any[] = task?.steps ?? [];
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center gap-2">
        <Activity className="h-3.5 w-3.5" /> Live Activity Feed
        <span className="ml-auto text-[10px] text-muted-foreground normal-case">{steps.length} events</span>
      </div>
      <ol className="max-h-[260px] overflow-y-auto divide-y divide-border">
        {steps.slice().reverse().map((s, i) => (
          <li key={i} className="p-2.5 text-xs flex items-start gap-3">
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
              [{new Date(s.ts).toLocaleTimeString()}]
            </span>
            <span className={`mt-1 inline-block h-2 w-2 rounded-full shrink-0 ${s.phase === "guard" ? "bg-amber-500" : s.phase === "failed" ? "bg-destructive" : "bg-primary"}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{s.note ?? String(s.phase).replace(/_/g, " ")}</div>
              {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-primary inline-flex items-center gap-1 truncate"><ExternalLink className="h-2.5 w-2.5" />{s.url}</a>}
            </div>
          </li>
        ))}
        {steps.length === 0 && <li className="p-3 text-xs text-muted-foreground">No activity yet.</li>}
      </ol>
    </div>
  );
}

// ---------- Agent Thoughts ----------
function ThoughtsPanel({ task }: { task: any }) {
  const steps: any[] = task?.steps ?? [];
  // Use notes from analyze/guard/extract phases as "thoughts"
  const thoughts = steps.filter((s) => ["analyze", "guard", "decision", "thought"].includes(s.phase)).slice(-6);
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center gap-2">
        <Brain className="h-3.5 w-3.5" /> Agent Thoughts
      </div>
      <ul className="p-3 space-y-2 text-xs">
        {thoughts.length === 0 && <li className="text-muted-foreground">The agent will narrate its reasoning here.</li>}
        {thoughts.map((t, i) => (
          <li key={i} className="rounded-md bg-primary/5 border border-primary/15 p-2">
            <div className="text-[10px] uppercase tracking-wider text-primary/80 mb-0.5">{t.phase}</div>
            <div>{t.note}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Extracted data ----------
function ExtractedSection({ task }: { task: any }) {
  const ex = task?.extracted ?? {};
  const draft = ex.draft;
  const hasAny = task && Object.keys(ex).length > 0;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5" /> Extracted Data
      </div>
      <div className="p-3 space-y-3 text-xs max-h-[360px] overflow-y-auto">
        {!task && <div className="text-muted-foreground">Select a task.</div>}
        {task && !hasAny && <div className="text-muted-foreground">Nothing extracted yet.</div>}
        {ex.emails?.length > 0 && (
          <Group title={`Emails (${ex.emails.length})`}>
            {ex.emails.map((e: string) => <div key={e} className="font-mono break-all">{e}</div>)}
          </Group>
        )}
        {ex.socialProfiles?.length > 0 && (
          <Group title={`Social Profiles (${ex.socialProfiles.length})`}>
            {ex.socialProfiles.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block text-primary truncate hover:underline">{u}</a>)}
          </Group>
        )}
        {ex.externalLinks?.length > 0 && (
          <Group title={`Links (${ex.externalLinks.length})`}>
            {ex.externalLinks.slice(0, 20).map((u: string) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="block text-primary truncate hover:underline">{u}</a>
            ))}
          </Group>
        )}
        {ex.videos?.length > 0 && (
          <Group title={`Videos (${ex.videos.length})`}>
            {ex.videos.map((v: any) => <a key={v.url} href={v.url} target="_blank" rel="noreferrer" className="block text-primary truncate hover:underline">{v.title}</a>)}
          </Group>
        )}
        {ex.bio && <Group title="Bio"><pre className="whitespace-pre-wrap text-muted-foreground">{String(ex.bio).slice(0, 600)}</pre></Group>}
        {draft && (
          <Group title="Email Draft">
            <div><span className="text-muted-foreground">To: </span><span className="font-mono">{draft.recipient}</span></div>
            <div className="mt-1"><span className="text-muted-foreground">Subject: </span>{draft.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{draft.body}</pre>
          </Group>
        )}
        {ex.prefill && (
          <Group title="Takedown Prefill">
            <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{JSON.stringify(ex.prefill, null, 2)}</pre>
          </Group>
        )}
      </div>
    </div>
  );
}

// ---------- Evidence Collected ----------
function EvidencePanel({ task }: { task: any }) {
  const shots: string[] = task?.screenshots ?? [];
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5" /> Evidence Collected
        <span className="ml-auto text-[10px] normal-case">{shots.length} screenshots</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto">
        {shots.length === 0 && <div className="col-span-2 text-xs text-muted-foreground">No evidence captured yet.</div>}
        {shots.map((s, i) => (
          <a key={i} href={s} target="_blank" rel="noreferrer" className="block rounded border border-border overflow-hidden hover:border-primary/40">
            <img src={s} alt={`evidence-${i}`} className="w-full h-20 object-cover bg-black/5" />
            <div className="px-1.5 py-0.5 text-[9px] text-muted-foreground truncate">step {i + 1}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ---------- New Task dialog ----------
function NewTaskDialog({
  onClose,
  onCreated,
  enqueue,
}: {
  onClose: () => void;
  onCreated: (id: string | null) => void;
  enqueue: ReturnType<typeof useServerFn<typeof enqueueAgentTask>>;
}) {
  const [selected, setSelected] = useState<TaskTypeDef | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!selected) return;
    // Required field validation
    for (const f of selected.fields) {
      if (f.required && !(fields[f.k] ?? "").trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setBusy(true);
    try {
      // Build subtasks (composite) or a single task
      const subs = selected.expand
        ? selected.expand(parseFields(selected, fields))
        : [{ worker: selected.worker, input: parseFields(selected, fields), label: selected.label }];

      let firstId: string | null = null;
      let offlineCount = 0;
      for (const sub of subs) {
        const r: any = await enqueue({ data: { type: sub.worker as any, input: sub.input } });
        if (r?.offline) { offlineCount++; continue; }
        if (!firstId) firstId = r.task?.id ?? null;
      }
      if (offlineCount === subs.length) {
        toast.error("Browser Agent offline — queue not reachable.");
      } else {
        toast.success(subs.length > 1 ? `Enqueued ${subs.length} sub-tasks` : "Task enqueued");
      }
      onCreated(firstId);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> New Agent Task</div>
            <div className="text-xs text-muted-foreground">Pick a workflow. Composite tasks fan out into multiple browser sessions automatically.</div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><XCircle className="h-4 w-4" /></button>
        </div>

        {!selected ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-4 max-h-[60vh] overflow-y-auto">
            {TASK_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.v}
                  onClick={() => { setSelected(t); setFields({}); }}
                  className="text-left rounded-lg border border-border bg-background/50 p-3 hover:border-primary/50 hover:bg-primary/5 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {t.label}
                        {t.worker === "composite" && <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px]">One-click</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{t.short}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{t.hint}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">← back</button>
              <div className="font-medium text-sm">{selected.label}</div>
              {selected.worker === "composite" && <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px]">composite</span>}
            </div>
            <div className="text-xs text-muted-foreground">{selected.hint}</div>
            <div className="space-y-2 pt-1">
              {selected.fields.map((f) => (
                <label key={f.k} className="block text-xs">
                  <span className="text-muted-foreground">{f.label}{f.required && <span className="text-destructive"> *</span>}</span>
                  <input
                    value={fields[f.k] ?? ""}
                    onChange={(e) => setFields((p) => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border p-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs">Close</button>
          <button
            onClick={submit}
            disabled={!selected || busy}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            style={{ background: "var(--gradient-violet)" }}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            Launch Agent
          </button>
        </div>
      </div>
    </div>
  );
}

function parseFields(def: TaskTypeDef, fields: Record<string, string>) {
  const input: Record<string, any> = {};
  for (const f of def.fields) {
    const v = fields[f.k];
    if (v === undefined || v === "") continue;
    if (f.k === "socialLinks" || f.k === "evidenceLinks") {
      input[f.k] = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (f.k === "deadlineHours") {
      input[f.k] = Number(v);
    } else {
      input[f.k] = v;
    }
  }
  return input;
}
