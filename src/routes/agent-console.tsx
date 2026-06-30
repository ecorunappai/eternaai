import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Play, Pause, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Camera, Plus } from "lucide-react";
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

const STATUS_TONE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  browser_opened: "bg-blue-500/10 text-blue-700",
  navigating: "bg-blue-500/10 text-blue-700",
  extracting: "bg-indigo-500/10 text-indigo-700",
  evidence_captured: "bg-indigo-500/10 text-indigo-700",
  contact_found: "bg-emerald-500/10 text-emerald-700",
  email_drafted: "bg-amber-500/10 text-amber-700",
  form_prepared: "bg-amber-500/10 text-amber-700",
  waiting_approval: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-700",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const TASK_TYPES = [
  { v: "youtube.investigate", label: "YouTube Investigation" },
  { v: "instagram.investigate", label: "Instagram Investigation" },
  { v: "contact.discover", label: "Contact Discovery" },
  { v: "email.prepare", label: "Warning Email Preparation" },
  { v: "takedown.prepare", label: "Takedown Preparation" },
] as const;

function AgentConsolePage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<any | null>(null);
  const [agentOnline, setAgentOnline] = useState<{ online: boolean; configured: boolean; reason?: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const enqueue = useServerFn(enqueueAgentTask);
  const getOne = useServerFn(getAgentTask);
  const listAll = useServerFn(listAgentTasks);
  const approve = useServerFn(approveAgentTask);
  const cancel = useServerFn(cancelAgentTask);
  const status = useServerFn(browserAgentStatus);

  async function refreshList() {
    try {
      const r = await listAll();
      setTasks(r.tasks);
    } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    if (!user) return;
    refreshList();
    status().then(setAgentOnline).catch(() => setAgentOnline({ online: false, configured: false, reason: "probe failed" }));
    const t = window.setInterval(refreshList, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Poll the selected task live (2s) — fallback for environments without SSE.
  useEffect(() => {
    if (!selectedId) { setCurrent(null); return; }
    let stop = false;
    async function tick() {
      try {
        const r = await getOne({ data: { workerTaskId: selectedId! } });
        if (!stop) setCurrent(r.task);
      } catch (e) { /* ignore */ }
    }
    tick();
    pollRef.current = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filteredTasks = useMemo(() => tasks, [tasks]);

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
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> Agent Console</h1>
          <p className="text-sm text-muted-foreground">Task-based browser operator. Public pages only. Legal complaints never auto-submit.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Plus className="h-4 w-4" /> New Task
        </button>
      </div>

      {agentOnline && !agentOnline.online && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700">
          <strong>Browser Agent offline.</strong> Showing persisted history only.
          {agentOnline.configured ? ` (${agentOnline.reason})` : " Configure BROWSER_AGENT_URL + BROWSER_AGENT_TOKEN to enable live runs."}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-4">
        {/* Queue */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Task Queue ({filteredTasks.length})
          </div>
          <ul className="max-h-[640px] overflow-y-auto divide-y divide-border">
            {filteredTasks.length === 0 && <li className="p-4 text-xs text-muted-foreground">No tasks yet. Click "New Task".</li>}
            {filteredTasks.map((t) => {
              const id = t.worker_task_id ?? t.id;
              const active = selectedId === id;
              const tone = STATUS_TONE[t.status] ?? "bg-muted";
              return (
                <li key={t.id}>
                  <button onClick={() => setSelectedId(id)} className={`w-full text-left p-3 ${active ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/30"}`}>
                    <div className="text-xs font-medium line-clamp-1">{TASK_TYPES.find(x => x.v === t.type)?.label ?? t.type}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{t.next_action ?? t.input?.query ?? t.input?.profileUrl ?? t.input?.channelUrl ?? ""}</div>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${tone}`}>{t.status.replace(/_/g, " ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Live session */}
        <section className="rounded-xl border border-border bg-card min-h-[640px]">
          {!current ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Bot className="mx-auto h-10 w-10 mb-2" />
              Select a task to view the live session.
            </div>
          ) : (
            <LiveSession task={current} busy={busy} onApprove={onApprove} onCancel={onCancel} />
          )}
        </section>

        {/* Extracted */}
        <section className="rounded-xl border border-border bg-card min-h-[640px]">
          <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extracted</div>
          {!current ? (
            <div className="p-4 text-xs text-muted-foreground">No data yet.</div>
          ) : (
            <ExtractedPanel task={current} />
          )}
        </section>
      </div>

      {showNew && <NewTaskDialog onClose={() => setShowNew(false)} onCreated={async (id) => { setShowNew(false); await refreshList(); setSelectedId(id); }} enqueue={enqueue} />}
    </AppShell>
  );
}

function LiveSession({ task, busy, onApprove, onCancel }: { task: any; busy: string | null; onApprove: () => void; onCancel: () => void }) {
  const steps: any[] = task.steps ?? [];
  const last = steps[steps.length - 1];
  const lastShot = (task.screenshots ?? [])[task.screenshots?.length - 1];
  const tone = STATUS_TONE[task.status] ?? "bg-muted";
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{TASK_TYPES.find(x => x.v === task.type)?.label ?? task.type}</div>
          <div className="text-xs text-muted-foreground truncate">{last?.url ?? task.next_action ?? task.nextAction ?? ""}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{task.status.replace(/_/g, " ")}</span>
      </div>

      {task.status === "waiting_approval" && (
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

      {lastShot && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30 flex items-center gap-1">
            <Camera className="h-3 w-3" /> Latest screenshot
          </div>
          <img src={lastShot} alt="latest" className="w-full max-h-[420px] object-contain bg-black/5" />
        </div>
      )}

      <div className="rounded-lg border border-border">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
          Timeline ({steps.length})
        </div>
        <ol className="max-h-[280px] overflow-y-auto divide-y divide-border">
          {steps.slice().reverse().map((s, i) => (
            <li key={i} className="p-2 text-xs flex items-start gap-2">
              <span className={`mt-0.5 inline-block h-2 w-2 rounded-full ${s.phase === "guard" ? "bg-amber-500" : s.phase === "failed" ? "bg-destructive" : "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{String(s.phase).replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(s.ts).toLocaleTimeString()}</span>
                </div>
                <div className="text-muted-foreground line-clamp-2">{s.note}</div>
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-primary inline-flex items-center gap-1"><ExternalLink className="h-2.5 w-2.5" />{s.url}</a>}
              </div>
            </li>
          ))}
          {steps.length === 0 && <li className="p-3 text-xs text-muted-foreground">Waiting for first step…</li>}
        </ol>
      </div>

      {task.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" /> {task.error}
        </div>
      )}
    </div>
  );
}

function ExtractedPanel({ task }: { task: any }) {
  const ex = task.extracted ?? {};
  const draft = ex.draft;
  return (
    <div className="p-3 space-y-3 text-xs max-h-[600px] overflow-y-auto">
      {ex.emails?.length > 0 && (
        <Group title={`Emails (${ex.emails.length})`}>
          {ex.emails.map((e: string) => <div key={e} className="font-mono break-all">{e}</div>)}
        </Group>
      )}
      {ex.externalLinks?.length > 0 && (
        <Group title={`Links (${ex.externalLinks.length})`}>
          {ex.externalLinks.slice(0, 20).map((u: string) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="block text-primary truncate hover:underline">{u}</a>
          ))}
        </Group>
      )}
      {ex.socialProfiles?.length > 0 && (
        <Group title={`Social Profiles (${ex.socialProfiles.length})`}>
          {ex.socialProfiles.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block text-primary truncate hover:underline">{u}</a>)}
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
          {ex.fields && (
            <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">Form fields ({ex.fields.length})</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2 text-[10px]">{JSON.stringify(ex.fields, null, 2)}</pre>
            </details>
          )}
        </Group>
      )}
      {Object.keys(ex).length === 0 && <div className="text-muted-foreground">Nothing extracted yet.</div>}
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

function NewTaskDialog({ onClose, onCreated, enqueue }: { onClose: () => void; onCreated: (id: string) => void; enqueue: ReturnType<typeof useServerFn<typeof enqueueAgentTask>> }) {
  const [type, setType] = useState<typeof TASK_TYPES[number]["v"]>("youtube.investigate");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const schema = useMemo(() => {
    switch (type) {
      case "youtube.investigate": return [
        { k: "query", label: "Creator name / search query", placeholder: "e.g. 'Jane Doe'" },
        { k: "channelUrl", label: "Channel URL (optional)", placeholder: "https://youtube.com/@…" },
      ];
      case "instagram.investigate": return [
        { k: "profileUrl", label: "Public profile URL", placeholder: "https://instagram.com/username" },
      ];
      case "contact.discover": return [
        { k: "websiteUrl", label: "Website URL", placeholder: "https://example.com" },
        { k: "socialLinks", label: "Social links (comma-separated)", placeholder: "https://linktr.ee/…, https://x.com/…" },
      ];
      case "email.prepare": return [
        { k: "recipientEmail", label: "Recipient email", placeholder: "creator@example.com" },
        { k: "subjectName", label: "Rights holder name", placeholder: "Jane Doe" },
        { k: "targetUrl", label: "Infringing URL", placeholder: "https://youtube.com/watch?v=…" },
        { k: "evidenceLinks", label: "Evidence URLs (comma-separated)", placeholder: "https://…" },
        { k: "deadlineHours", label: "Deadline (hours)", placeholder: "72" },
      ];
      case "takedown.prepare": return [
        { k: "platform", label: "Platform", placeholder: "youtube | instagram | tiktok | x | facebook" },
        { k: "targetUrl", label: "Infringing URL", placeholder: "https://…" },
        { k: "originalUrl", label: "Original work URL", placeholder: "https://…" },
        { k: "rightsOwnerName", label: "Rights owner name", placeholder: "Jane Doe" },
        { k: "signature", label: "Authorized signature (typed name)", placeholder: "Jane Doe" },
        { k: "evidenceLinks", label: "Evidence URLs (comma-separated)", placeholder: "https://…" },
      ];
    }
  }, [type]);

  async function submit() {
    setBusy(true);
    try {
      const input: Record<string, any> = {};
      for (const f of schema) {
        const v = fields[f.k] ?? "";
        if (!v) continue;
        if (f.k === "socialLinks" || f.k === "evidenceLinks") input[f.k] = v.split(",").map(s => s.trim()).filter(Boolean);
        else if (f.k === "deadlineHours") input[f.k] = Number(v);
        else input[f.k] = v;
      }
      const r = await enqueue({ data: { type, input } });
      if ((r as any).offline) { toast.error((r as any).reason); return; }
      toast.success("Task queued");
      onCreated(((r as any).task as any).id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">New Task</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XCircle className="h-5 w-5" /></button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Task type</label>
          <select value={type} onChange={(e) => { setType(e.target.value as any); setFields({}); }} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            {TASK_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        {schema.map((f) => (
          <div key={f.k}>
            <label className="text-xs text-muted-foreground">{f.label}</label>
            <input value={fields[f.k] ?? ""} onChange={(e) => setFields({ ...fields, [f.k]: e.target.value })}
              placeholder={f.placeholder}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        ))}
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-800">
          The agent visits public pages only and never auto-submits legal complaints. Warning emails and takedowns halt for your manual review.
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
          </button>
        </div>
      </div>
    </div>
  );
}
