import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gavel, Loader2, ShieldCheck, ExternalLink, AlertTriangle, CheckCircle2, Edit3, Scale, X, FileText, Camera, Wand2, Download, Copy, Mail, Youtube, Link2, Unlink, Bot, PlayCircle, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { prepareTakedown, reviewTakedown, buildAutofillArtifacts, TAKEDOWN_FORM_URLS, TAKEDOWN_LABELS } from "@/lib/takedown.functions";
import { getYoutubeConnection, startYoutubeOAuth, disconnectYoutube, prepareYoutubeReport, markYoutubeReportSubmitted } from "@/lib/youtube-connect.functions";
import { enqueueAgentTask, getAgentTask, getAgentLiveFrame, approveAgentTask, cancelAgentTask } from "@/lib/browser-agent-client.functions";

export const Route = createFileRoute("/takedown")({
  head: () => ({ meta: [{ title: "Takedown Center — Eterna AI" }] }),
  component: TakedownPage,
});

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  evidence_missing: "bg-destructive/10 text-destructive",
  ready: "bg-blue-500/10 text-blue-700",
  preparing_form: "bg-indigo-500/10 text-indigo-700",
  waiting_approval: "bg-amber-500/10 text-amber-700",
  submitted: "bg-emerald-500/10 text-emerald-700",
  platform_reviewing: "bg-blue-500/10 text-blue-700",
  removed: "bg-emerald-600/15 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
  counter_notice: "bg-orange-500/10 text-orange-700",
  escalated_legal: "bg-purple-500/10 text-purple-700",
};

const TYPE_OPTIONS = Object.keys(TAKEDOWN_LABELS) as Array<keyof typeof TAKEDOWN_LABELS>;

function TakedownPage() {
  const { user } = useAuth();
  const prepare = useServerFn(prepareTakedown);
  const review = useServerFn(reviewTakedown);
  const buildAutofill = useServerFn(buildAutofillArtifacts);
  const [autofill, setAutofill] = useState<any | null>(null);
  const [autofillBusy, setAutofillBusy] = useState(false);

  const [cases, setCases] = useState<any[]>([]);
  const [takedowns, setTakedowns] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [form, setForm] = useState({
    takedownType: "youtube_copyright" as keyof typeof TAKEDOWN_LABELS,
    rightsOwnerName: "",
    rightsOwnerEmail: user?.email ?? "",
    assignedManager: "",
    requireWarning: true,
  });
  const [preparing, setPreparing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ---------- YouTube account connection ----------
  const getYtConn = useServerFn(getYoutubeConnection);
  const startYtOAuth = useServerFn(startYoutubeOAuth);
  const disconnectYt = useServerFn(disconnectYoutube);
  const prepareYtReport = useServerFn(prepareYoutubeReport);
  const markYtSubmitted = useServerFn(markYoutubeReportSubmitted);
  const [yt, setYt] = useState<{ connection: any; oauthConfigured: boolean } | null>(null);
  const [ytBusy, setYtBusy] = useState<string | null>(null);

  // ---------- Browser Agent (takedown.prepare) ----------
  const enqueueAgent = useServerFn(enqueueAgentTask);
  const pollAgent = useServerFn(getAgentTask);
  const liveFrame = useServerFn(getAgentLiveFrame);
  const approveAgent = useServerFn(approveAgentTask);
  const cancelAgent = useServerFn(cancelAgentTask);
  const [agentTaskId, setAgentTaskId] = useState<string | null>(null);
  const [agentTask, setAgentTask] = useState<any | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentFrame, setAgentFrame] = useState<{ dataUrl?: string; label?: string | null; pageUrl?: string | null; ts?: number } | null>(null);
  const [managerModal, setManagerModal] = useState(false);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    if (!agentTaskId) return;
    let stopped = false;
    async function tick() {
      try {
        const [t, f] = await Promise.all([
          pollAgent({ data: { workerTaskId: agentTaskId! } }),
          liveFrame({ data: { workerTaskId: agentTaskId! } }),
        ]);
        if (stopped) return;
        if (!t.offline && t.task) {
          setAgentTask(t.task);
          if (t.task.status === "waiting_approval") setManagerModal(true);
          if (["completed", "failed", "cancelled"].includes(t.task.status)) {
            clearInterval(pollRef.current);
          }
        }
        if (!f.offline && (f as any).ready) {
          setAgentFrame({ dataUrl: (f as any).dataUrl, label: (f as any).label, pageUrl: (f as any).pageUrl, ts: (f as any).ts });
        } else if (!f.offline) {
          setAgentFrame((prev) => ({ ...(prev ?? {}), label: (f as any).label ?? prev?.label ?? null }));
        }
      } catch { /* ignore transient */ }
    }
    tick();
    pollRef.current = setInterval(tick, 2000);
    return () => { stopped = true; clearInterval(pollRef.current); };
  }, [agentTaskId]);

  async function onOpenYouTubeForm() {
    if (!active) return;
    setAgentBusy(true);
    setAgentFrame(null);
    setAgentTask(null);
    setManagerModal(false);

    // Immediately open the official YouTube copyright form in a new tab
    // so the user always sees a popup, even if the Browser Agent is offline.
    const formUrl =
      active.youtube_report_payload?.form_url ||
      active.form_url ||
      "https://www.youtube.com/copyright_complaint_form";
    try {
      const win = (window.top ?? window).open(formUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Popup blocked — allow popups for this site to open the YouTube form.");
      }
    } catch {
      window.open(formUrl, "_blank", "noopener,noreferrer");
    }

    try {

      const r: any = await enqueueAgent({
        data: {
          type: "takedown.prepare",
          caseId: active.case_id ?? undefined,
          input: {
            platform: "youtube",
            targetUrl: active.infringing_url,
            originalUrl: active.original_url ?? undefined,
            rightsOwnerName: active.rights_owner_name,
            rightsOwnerEmail: active.rights_owner_email,
            signature: active.rights_owner_name,
            evidenceLinks: active.evidence_urls ?? [],
            reason: active.violation_description,
            title: active.form_fields?.original_work_description ?? active.rights_owner_name,
          },
        },
      });
      if (r.offline) { toast.error(r.reason || "Browser Agent unavailable"); return; }
      setAgentTaskId(r.task.id);
      toast.success("Browser Agent opening YouTube copyright form…");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setAgentBusy(false); }
  }

  async function onCancelAgent() {
    if (!agentTaskId) return;
    await cancelAgent({ data: { workerTaskId: agentTaskId } }).catch(() => {});
    toast.message("Agent task cancelled");
  }

  async function onManagerApprove() {
    if (!agentTaskId || !active) return;
    setAgentBusy(true);
    try {
      // Worker halts before submit; approving here only records the decision.
      await approveAgent({ data: { workerTaskId: agentTaskId } }).catch(() => {});
      const lastShot = (agentTask?.screenshots ?? []).slice(-1)[0];
      await review({
        data: {
          takedownId: active.id,
          action: "mark_submitted",
          approver: form.assignedManager || "manager",
          confirmationScreenshotUrl: lastShot,
          notes: "Manager approved. Manual submission required — Eterna does not auto-submit.",
        },
      });
      toast.success("Approved — please complete manual submission in the opened form");
      setManagerModal(false);
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setAgentBusy(false); }
  }

  async function onManagerReject() {
    if (!agentTaskId) return;
    await cancelAgent({ data: { workerTaskId: agentTaskId } }).catch(() => {});
    await review({ data: { takedownId: active!.id, action: "edit", notes: "Manager rejected prepared package — needs edits." } }).catch(() => {});
    setManagerModal(false);
    toast.message("Rejected — takedown moved back to editing");
    await refresh();
  }



  async function refreshYt() {
    try { setYt(await getYtConn({})); } catch { /* ignore */ }
  }
  useEffect(() => { if (user) refreshYt(); }, [user?.id]);

  // Handle ?yt=... return from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("yt");
    if (!status) return;
    if (status === "connected") toast.success("YouTube account connected");
    else toast.error(`YouTube connect: ${status.replace(/_/g, " ")}`);
    params.delete("yt");
    const next = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", next);
    refreshYt();
  }, []);

  async function onConnectYt() {
    setYtBusy("connect");
    try {
      const { authUrl } = await startYtOAuth({ data: { returnTo: "/takedown" } });
      window.location.href = authUrl;
    } catch (e: any) { toast.error(e.message); setYtBusy(null); }
  }
  async function onDisconnectYt() {
    setYtBusy("disconnect");
    try { await disconnectYt({}); toast.success("YouTube account disconnected"); await refreshYt(); }
    catch (e: any) { toast.error(e.message); }
    finally { setYtBusy(null); }
  }
  async function onPrepareYtReport() {
    if (!active) return;
    setYtBusy("prepare");
    try {
      await prepareYtReport({ data: { takedownId: active.id } });
      toast.success("YouTube report prepared — review and submit");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setYtBusy(null); }
  }
  function openYtAssistant() {
    if (!active?.youtube_report_payload) return;
    const url = active.youtube_report_payload.form_url || "https://www.youtube.com/copyright_complaint_form";
    try { (window.top ?? window).open(url, "_blank", "noopener,noreferrer"); }
    catch { window.open(url, "_blank", "noopener,noreferrer"); }
  }
  async function onMarkYtSubmitted() {
    if (!active) return;
    setYtBusy("submitted");
    try {
      await markYtSubmitted({ data: { takedownId: active.id } });
      toast.success("Marked submitted");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setYtBusy(null); }
  }




  async function refresh() {
    if (!user) return;
    const [tdRes, caseRes] = await Promise.all([
      supabase.from("takedown_cases").select("*").order("created_at", { ascending: false }),
      supabase.from("enforcement_cases").select("id,subject_name,target_url,platform,status,page_title").order("created_at", { ascending: false }).limit(50),
    ]);
    setTakedowns(tdRes.data ?? []);
    setCases(caseRes.data ?? []);
  }
  useEffect(() => { refresh(); }, [user?.id]);

  const active = useMemo(() => takedowns.find((t) => t.id === activeId), [takedowns, activeId]);

  const ytStatusLabel = (() => {
    if (!yt?.connection || yt.connection.status !== "connected") return "Not Connected";
    if (!active) return "Connected";
    if (active.youtube_report_status === "submitted" || active.status === "submitted") return "Submitted";
    if (active.youtube_report_status === "waiting_user_review") return "Waiting User Review";
    if (active.youtube_report_status === "prepared") return "Report Prepared";
    if ((active.evidence_urls?.length ?? 0) > 0) return "Evidence Ready";
    return "Connected";
  })();


  async function onPrepare() {
    if (!selectedCaseId) return toast.error("Select an enforcement case first");
    if (!form.rightsOwnerName || !form.rightsOwnerEmail) return toast.error("Rights owner name + email required");
    setPreparing(true);
    try {
      const row: any = await prepare({ data: { caseId: selectedCaseId, ...form } });
      toast.success(row.missing_fields?.length ? "Drafted — evidence missing" : "Takedown ready for approval");
      setActiveId(row.id);
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setPreparing(false); }
  }

  async function act(action: string, extra: any = {}) {
    if (!active) return;
    setBusy(action);
    try {
      await review({ data: { takedownId: active.id, action, ...extra } });
      toast.success(`Action: ${action.replace(/_/g, " ")}`);
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <AppShell title="Takedown Center">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        {/* LEFT — Prepare new takedown */}
        <section className="surface-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Gavel className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold">Prepare Takedown</div>
              <div className="text-xs text-muted-foreground">Select case → AI fills the platform form</div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium">Enforcement case</label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)}>
              <option value="">— pick an investigated case —</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.subject_name ?? c.page_title ?? c.target_url ?? c.id).toString().slice(0, 70)}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium pt-2">Takedown type</label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.takedownType} onChange={(e) => setForm({ ...form, takedownType: e.target.value as any })}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TAKEDOWN_LABELS[t]}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium">Rights owner</label>
                <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.rightsOwnerName} onChange={(e) => setForm({ ...form, rightsOwnerName: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium">Owner email</label>
                <input type="email" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.rightsOwnerEmail} onChange={(e) => setForm({ ...form, rightsOwnerEmail: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium">Assigned manager / reviewer</label>
              <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Legal team / manager name" value={form.assignedManager} onChange={(e) => setForm({ ...form, assignedManager: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={form.requireWarning} onChange={(e) => setForm({ ...form, requireWarning: e.target.checked })} />
              Prefer warning email first (optional — never blocks platform takedown)
            </label>

            <button onClick={onPrepare} disabled={preparing} className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-60">
              {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Prepare Takedown Package
            </button>
          </div>
        </section>

        {/* RIGHT — Active takedown review */}
        <section className="surface-card p-5 space-y-4">
          {!active ? (
            <div className="text-sm text-muted-foreground py-10 text-center">Select a takedown below to review.</div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{TAKEDOWN_LABELS[active.takedown_type]}</div>
                  <div className="font-semibold">{active.platform} — {active.rights_owner_name}</div>
                  <a href={active.infringing_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                    {active.infringing_url.slice(0, 60)}… <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_TONE[active.status] ?? "bg-muted"}`}>{active.status.replace(/_/g, " ")}</span>
              </div>

              {active.missing_fields?.length ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Cannot start takedown. Missing required evidence.</div>
                    <ul className="list-disc pl-5 mt-1">{active.missing_fields.map((m: string) => <li key={m}>{m.replace(/_/g, " ")}</li>)}</ul>
                  </div>
                </div>
              ) : !active.warning_sent_at ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">No public contact found. Warning email skipped.</div>
                    <div className="mt-1">Platform takedown can proceed. Contact search failure is recorded as contact attempt proof.</div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info label="Similarity" value={active.similarity_score ? `${Math.round(active.similarity_score)}%` : "—"} />
                <Info label="Warning sent" value={active.warning_sent_at ? new Date(active.warning_sent_at).toLocaleString() : "—"} />
                <Info label="Deadline" value={active.response_deadline ? new Date(active.response_deadline).toLocaleString() : "—"} />
                <Info label="Manager" value={active.assigned_manager ?? "—"} />
              </div>

              <details className="rounded-md border bg-background/60">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Form fields ({Object.keys(active.form_fields ?? {}).length})</summary>
                <div className="p-3 grid grid-cols-1 gap-2 text-xs">
                  {Object.entries(active.form_fields ?? {}).map(([k, v]) => (
                    <div key={k}><span className="text-muted-foreground">{k}:</span> <span className="font-mono">{String(v).slice(0, 200)}</span></div>
                  ))}
                </div>
              </details>

              <details className="rounded-md border bg-background/60">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium flex items-center gap-2"><Scale className="h-3.5 w-3.5" /> Legal declaration</summary>
                <div className="p-3 text-xs whitespace-pre-wrap">{active.legal_declaration}</div>
              </details>

              <details className="rounded-md border bg-amber-500/5">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium flex items-center gap-2 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Risk warnings</summary>
                <div className="p-3 text-xs whitespace-pre-wrap">{active.risk_warnings}</div>
              </details>

              {active.evidence_urls?.length ? (
                <div className="rounded-md border p-3">
                  <div className="text-xs font-medium flex items-center gap-2 mb-2"><Camera className="h-3.5 w-3.5" /> Evidence attached ({active.evidence_urls.length})</div>
                  <ul className="text-xs space-y-1">
                    {active.evidence_urls.slice(0, 5).map((u: string, i: number) => (
                      <li key={i}><a href={u} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate inline-block max-w-full">{u.slice(0, 80)}</a></li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* ---------- YouTube Reporting ---------- */}
              <div className="rounded-md border bg-red-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-red-600 text-white"><Youtube className="h-4 w-4" /></div>
                    <div>
                      <div className="text-sm font-semibold">YouTube Reporting</div>
                      <div className="text-[11px] text-muted-foreground">
                        {yt?.connection?.status === "connected"
                          ? <>Connected as <span className="font-medium">{yt.connection.youtube_channel_title || yt.connection.email}</span></>
                          : "Connect your Google/YouTube account to file the report yourself"}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-background border">{ytStatusLabel}</span>
                </div>

                {!yt?.oauthConfigured && (
                  <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Google OAuth not configured — Connect button is disabled. Use Open Reporting Assistant for the fallback flow (form opens in new tab with prepared evidence).
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {yt?.connection?.status !== "connected" ? (
                    <button
                      onClick={onConnectYt}
                      disabled={!yt?.oauthConfigured || ytBusy === "connect"}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 text-white px-3 py-1.5 text-xs hover:bg-red-700 disabled:opacity-50"
                    >
                      {ytBusy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Connect YouTube Account
                    </button>
                  ) : (
                    <button
                      onClick={onDisconnectYt}
                      disabled={ytBusy === "disconnect"}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10 disabled:opacity-50"
                    >
                      {ytBusy === "disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                      Disconnect Account
                    </button>
                  )}

                  <button
                    onClick={onPrepareYtReport}
                    disabled={(active.missing_fields?.length ?? 0) > 0 || ytBusy === "prepare"}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    {ytBusy === "prepare" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Prepare Report
                  </button>

                  <button
                    onClick={openYtAssistant}
                    disabled={!active.youtube_report_payload}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Reporting Assistant
                  </button>

                  {active.youtube_report_status === "waiting_user_review" && (
                    <button
                      onClick={onMarkYtSubmitted}
                      disabled={ytBusy === "submitted"}
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 text-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {ytBusy === "submitted" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      I&apos;ve Submitted It
                    </button>
                  )}
                </div>

                {active.youtube_report_payload && (
                  <details className="rounded border bg-background/60">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Prepared report — review before submit</summary>
                    <pre className="p-3 text-[11px] whitespace-pre-wrap max-h-64 overflow-auto">{JSON.stringify(active.youtube_report_payload, null, 2)}</pre>
                  </details>
                )}
              </div>

              {/* ---------- Browser Agent — YouTube Copyright Form ---------- */}
              {active.takedown_type?.startsWith("youtube") && (
                <div className="rounded-md border bg-violet-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-md bg-violet-600 text-white"><Bot className="h-4 w-4" /></div>
                      <div>
                        <div className="text-sm font-semibold">Browser Agent — YouTube Copyright</div>
                        <div className="text-[11px] text-muted-foreground">Opens the official YouTube copyright form, pre-fills safe fields, captures screenshots, and halts before submit for manager approval.</div>
                      </div>
                    </div>
                    {agentTask && (
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-background border">
                        {String(agentTask.status).replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  <div className="rounded bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-800 flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Never auto-submits. Never bypasses login/CAPTCHA. If YouTube asks for login or verification, the agent pauses for human intervention.
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onOpenYouTubeForm}
                      disabled={agentBusy || (active.missing_fields?.length ?? 0) > 0}
                      className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-xs hover:bg-violet-700 disabled:opacity-50"
                    >
                      {agentBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                      Open YouTube Copyright Form
                    </button>
                    {agentTaskId && agentTask && !["completed","failed","cancelled"].includes(agentTask.status) && (
                      <button
                        onClick={onCancelAgent}
                        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10"
                      ><StopCircle className="h-3.5 w-3.5" /> Stop agent</button>
                    )}
                  </div>

                  {agentTaskId && (
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="rounded border bg-background overflow-hidden">
                        <div className="px-3 py-1.5 text-[11px] font-medium border-b flex items-center gap-2">
                          <Camera className="h-3.5 w-3.5" />
                          Live browser session
                          {agentFrame?.label && <span className="text-muted-foreground">· {agentFrame.label}</span>}
                        </div>
                        {agentFrame?.dataUrl ? (
                          <img src={agentFrame.dataUrl} alt="Live agent frame" className="w-full max-h-72 object-contain bg-black/5" />
                        ) : (
                          <div className="h-40 grid place-items-center text-[11px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> waiting for first frame…</div>
                        )}
                        {agentFrame?.pageUrl && (
                          <div className="px-3 py-1 text-[10px] text-muted-foreground truncate">{agentFrame.pageUrl}</div>
                        )}
                      </div>
                      <div className="rounded border bg-background">
                        <div className="px-3 py-1.5 text-[11px] font-medium border-b">Timeline</div>
                        <ol className="p-3 space-y-1.5 text-[11px] max-h-64 overflow-auto">
                          {(agentTask?.steps ?? []).slice(-15).map((s: any, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                              <div>
                                <div className="font-medium">{s.phase}</div>
                                <div className="text-muted-foreground">{s.note}</div>
                              </div>
                            </li>
                          ))}
                          {!(agentTask?.steps ?? []).length && <li className="text-muted-foreground">No steps yet…</li>}
                        </ol>
                      </div>
                    </div>
                  )}

                  {agentTask?.status === "failed" && agentTask.error && (
                    <div className="rounded bg-destructive/10 border border-destructive/30 px-3 py-2 text-[11px] text-destructive">
                      {String(agentTask.error).includes("login") || String(agentTask.error).includes("captcha")
                        ? "Manual review required — YouTube requested login/verification. Complete it in a browser then retry."
                        : agentTask.error}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">

                <button
                  type="button"
                  onClick={() => { try { (window.top ?? window).open(active.form_url, "_blank", "noopener,noreferrer"); } catch { window.open(active.form_url, "_blank", "noopener,noreferrer"); } }}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open platform form
                </button>
                <button onClick={() => act("approve_submit", { approver: form.assignedManager || "manager" })} disabled={!!busy || (active.missing_fields?.length ?? 0) > 0} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-50">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve & Submit
                </button>
                <button onClick={() => act("edit")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => act("legal_review")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/40 text-purple-700 px-3 py-1.5 text-xs hover:bg-purple-500/10">
                  <Scale className="h-3.5 w-3.5" /> Send to Legal Review
                </button>
                <button onClick={() => act("cancel")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10">
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
                {active.status === "submitted" && (
                  <>
                    <button onClick={() => act("mark_removed")} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent">Mark Removed</button>
                    <button onClick={() => act("mark_rejected")} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent">Mark Rejected</button>
                  </>
                )}
                <button
                  onClick={async () => {
                    setAutofillBusy(true);
                    try {
                      const r = await buildAutofill({ data: { takedownId: active.id } });
                      setAutofill(r);
                      toast.success("Autofill artifacts ready");
                    } catch (e: any) { toast.error(e.message); }
                    finally { setAutofillBusy(false); }
                  }}
                  disabled={autofillBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-xs hover:bg-violet-700 disabled:opacity-50"
                >
                  {autofillBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Generate Autofill
                </button>
              </div>

              {autofill && (
                <div className="rounded-md border bg-violet-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4 text-violet-600" /> Autofill — {autofill.platform}</div>
                    <button onClick={() => setAutofill(null)} className="text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="text-xs text-muted-foreground">{autofill.notes}</p>
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-800 flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Eterna AI never submits on your behalf. Review every field, then click Submit yourself.
                  </div>

                  {autofill.kind === "email" ? (
                    <div className="space-y-2">
                      <a href={autofill.mailto} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs">
                        <Mail className="h-3.5 w-3.5" /> Open in mail client
                      </a>
                      <button
                        onClick={() => { navigator.clipboard.writeText(autofill.body); toast.success("Body copied"); }}
                        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ml-2"
                      ><Copy className="h-3.5 w-3.5" /> Copy email body</button>
                      <pre className="text-[11px] bg-background border rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">{autofill.body}</pre>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-medium mb-1">1 · Bookmarklet (one-click in-browser autofill)</div>
                        <p className="text-[11px] text-muted-foreground mb-2">Drag this link to your bookmarks bar. Open the platform form, sign in, click the bookmarklet — fields fill, nothing submits.</p>
                        <div className="flex items-center gap-2">
                          <a
                            href={autofill.bookmarklet}
                            onClick={(e) => e.preventDefault()}
                            draggable
                            className="inline-flex items-center gap-1.5 rounded-md border-2 border-dashed border-violet-500 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 cursor-grab"
                          >📌 Eterna Autofill — {autofill.platform}</a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(autofill.bookmarklet); toast.success("Bookmarklet copied"); }}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs"
                          ><Copy className="h-3.5 w-3.5" /> Copy</button>
                          <button
                            type="button"
                            onClick={() => { try { (window.top ?? window).open(autofill.url, "_blank", "noopener,noreferrer"); } catch { window.open(autofill.url, "_blank", "noopener,noreferrer"); } }}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs hover:bg-accent"
                          ><ExternalLink className="h-3.5 w-3.5" /> Open form</button>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium mb-1">2 · Playwright script (run locally, no submit)</div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const blob = new Blob([autofill.script], { type: "text/javascript" });
                              const u = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = u; a.download = `eterna-autofill-${active.id.slice(0,8)}.mjs`; a.click();
                              URL.revokeObjectURL(u);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs"
                          ><Download className="h-3.5 w-3.5" /> Download fill.mjs</button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(autofill.script); toast.success("Script copied"); }}
                            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                          ><Copy className="h-3.5 w-3.5" /> Copy</button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          <code>npm i -D playwright &amp;&amp; npx playwright install chromium &amp;&amp; node fill.mjs</code>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>


      {/* LIST */}
      <section className="surface-card mt-6 overflow-hidden">
        <div className="px-5 py-3 border-b font-semibold text-sm">Takedown Cases</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Case</th>
                <th className="text-left px-4 py-2">Platform</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Evidence</th>
                <th className="text-left px-4 py-2">Warning</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Manager</th>
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {takedowns.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-xs">No takedowns yet. Prepare one above.</td></tr>
              )}
              {takedowns.map((t) => (
                <tr key={t.id} className="border-t hover:bg-accent/40 cursor-pointer" onClick={() => setActiveId(t.id)}>
                  <td className="px-4 py-2 font-mono text-xs">{t.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{t.platform}</td>
                  <td className="px-4 py-2 text-xs">{TAKEDOWN_LABELS[t.takedown_type]}</td>
                  <td className="px-4 py-2 text-xs">{t.evidence_urls?.length ?? 0} files</td>
                  <td className="px-4 py-2 text-xs">{t.warning_sent_at ? "Sent" : "—"}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_TONE[t.status] ?? "bg-muted"}`}>{t.status.replace(/_/g, " ")}</span></td>
                  <td className="px-4 py-2 text-xs">{t.assigned_manager ?? "—"}</td>
                  <td className="px-4 py-2 text-right"><button className="text-xs text-primary hover:underline">Review →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manager approval modal */}
      {managerModal && active && agentTask && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setManagerModal(false)}>
          <div className="w-full max-w-2xl rounded-lg bg-background border shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-violet-600" />
                <div className="font-semibold text-sm">Manager Approval Required</div>
              </div>
              <button onClick={() => setManagerModal(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-xs text-muted-foreground">
                Agent halted at <span className="font-mono">{agentTask.status}</span>. Review evidence and pre-filled fields, then approve manual submission. Eterna AI will never submit the form for you.
              </div>
              {(agentTask.screenshots ?? []).slice(-1).map((s: string, i: number) => (
                <img key={i} src={s} alt="Prepared form screenshot" className="w-full rounded border max-h-64 object-contain bg-black/5" />
              ))}
              <details className="rounded border bg-background/60" open>
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Prepared field values</summary>
                <pre className="p-3 text-[11px] whitespace-pre-wrap max-h-56 overflow-auto">{JSON.stringify(agentTask.extracted ?? {}, null, 2)}</pre>
              </details>
              <div className="rounded bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-800 flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Approving records the decision and marks the takedown as submitted after you complete the final submit manually in the opened form.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={onManagerReject} disabled={agentBusy} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10 disabled:opacity-50">
                  <X className="h-3.5 w-3.5" /> Reject / edit
                </button>
                <button onClick={onManagerApprove} disabled={agentBusy} className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-xs hover:bg-violet-700 disabled:opacity-50">
                  {agentBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve manual submission
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>

  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
