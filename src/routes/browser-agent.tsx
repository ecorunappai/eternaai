import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Loader2, ExternalLink, Mail, ShieldAlert, Eye, Send, Scale, FileText, Camera, Search, AlertTriangle, CheckCircle2, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  openCaseFromMatch,
  investigateCase,
  discoverContacts,
  draftWarningEmail,
  approveWarningEmail,
} from "@/lib/browser-agent.functions";

export const Route = createFileRoute("/browser-agent")({
  head: () => ({ meta: [{ title: "AI Browser Agent — Eterna AI" }] }),
  component: BrowserAgentPage,
});

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "bg-muted text-muted-foreground" },
  browsing: { label: "Browsing", tone: "bg-blue-500/10 text-blue-700" },
  evidence_saved: { label: "Evidence Saved", tone: "bg-indigo-500/10 text-indigo-700" },
  contact_searching: { label: "Searching Contacts", tone: "bg-blue-500/10 text-blue-700" },
  contact_found: { label: "Contact Found", tone: "bg-emerald-500/10 text-emerald-700" },
  email_drafted: { label: "Email Drafted", tone: "bg-amber-500/10 text-amber-700" },
  waiting_approval_delivery: { label: "Approved — Pending Delivery", tone: "bg-primary/10 text-primary" },
  blocked: { label: "Blocked", tone: "bg-destructive/10 text-destructive" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
};

function BrowserAgentPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [draftRecipient, setDraftRecipient] = useState("");
  const [draftOwner, setDraftOwner] = useState("");
  const [draftDeadline, setDraftDeadline] = useState(72);

  const open = useServerFn(openCaseFromMatch);
  const investigate = useServerFn(investigateCase);
  const discover = useServerFn(discoverContacts);
  const draft = useServerFn(draftWarningEmail);
  const approve = useServerFn(approveWarningEmail);

  async function load() {
    const [m, c] = await Promise.all([
      supabase.from("discovered_matches").select("id,video_title,channel_name,source_url,platform,risk_level,final_confidence_score").order("created_at", { ascending: false }).limit(40),
      supabase.from("enforcement_cases").select("*").order("created_at", { ascending: false }),
    ]);
    setMatches(m.data ?? []);
    setCases(c.data ?? []);
    if (selectedCase) {
      const updated = (c.data ?? []).find((x: any) => x.id === selectedCase.id);
      if (updated) setSelectedCase(updated);
    }
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function loadCaseDetail(caseId: string) {
    const [ev, ct, em] = await Promise.all([
      supabase.from("case_evidence").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      supabase.from("creator_contacts").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      supabase.from("warning_emails").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
    ]);
    setEvidence(ev.data ?? []);
    setContacts(ct.data ?? []);
    setEmails(em.data ?? []);
    const emailContact = (ct.data ?? []).find((x: any) => x.contact_type === "email");
    if (emailContact && !draftRecipient) setDraftRecipient(emailContact.value);
  }

  async function selectCase(c: any) {
    setSelectedCase(c);
    setDraftRecipient("");
    await loadCaseDetail(c.id);
  }

  async function onOpen(matchId: string) {
    setBusy("open:" + matchId);
    try {
      const r = await open({ data: { matchId } });
      toast.success(r.reused ? "Case already exists" : "Case created");
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  async function runStep(step: "browse" | "contacts" | "draft" | "approve" | "legal" | "cancel", arg?: any) {
    if (!selectedCase) return;
    setBusy(step);
    try {
      if (step === "browse") {
        const r = await investigate({ data: { caseId: selectedCase.id } });
        toast.success(`Page captured · ${r.evidenceCount} evidence items`);
      } else if (step === "contacts") {
        const r = await discover({ data: { caseId: selectedCase.id } });
        toast.success(`Found ${r.emails} emails · ${r.socials} social links`);
      } else if (step === "draft") {
        if (!draftRecipient || !draftOwner) return toast.error("Recipient email and rights-owner name required");
        await draft({ data: { caseId: selectedCase.id, recipientEmail: draftRecipient, rightsOwnerName: draftOwner, deadlineHours: draftDeadline } });
        toast.success("AI draft ready for human review");
      } else if (step === "approve") {
        await approve({ data: { emailId: arg, action: "approve_mark_sent" } });
        toast.success("Approved · queued for delivery (review-only mode)");
      } else if (step === "legal") {
        await approve({ data: { emailId: arg, action: "legal_review" } });
        toast.message("Sent to legal review");
      } else if (step === "cancel") {
        await approve({ data: { emailId: arg, action: "cancel" } });
        toast.message("Draft cancelled");
      }
      await load();
      await loadCaseDetail(selectedCase.id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <AppShell title="AI Browser Agent">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> AI Browser Agent</h1>
        <p className="text-sm text-muted-foreground">Automated investigation, evidence capture, contact discovery, and warning-email drafting. Every enforcement action requires human approval — nothing is auto-submitted.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        {/* Left: queue */}
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Search className="h-3 w-3" /> Open a case from a match</div>
            <ul className="max-h-[280px] overflow-y-auto divide-y divide-border">
              {matches.length === 0 && <li className="p-4 text-xs text-muted-foreground">No discovered matches yet. Run a YouTube or Matching scan first.</li>}
              {matches.map((m) => (
                <li key={m.id} className="p-3 hover:bg-accent/30 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium line-clamp-2">{m.video_title ?? m.source_url}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.channel_name ?? m.platform} · {Number(m.final_confidence_score ?? 0).toFixed(0)}%</div>
                  </div>
                  <button onClick={() => onOpen(m.id)} disabled={busy === "open:" + m.id} className="text-[10px] rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-50">
                    {busy === "open:" + m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Open"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cases ({cases.length})</div>
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-border">
              {cases.map((c) => {
                const s = STATUS_LABEL[c.status] ?? { label: c.status, tone: "bg-muted" };
                const active = selectedCase?.id === c.id;
                return (
                  <li key={c.id}>
                    <button onClick={() => selectCase(c)} className={`w-full text-left p-3 ${active ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/30"}`}>
                      <div className="text-xs font-medium line-clamp-1">{c.subject_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{c.target_url}</div>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${s.tone}`}>{s.label}</span>
                    </button>
                  </li>
                );
              })}
              {cases.length === 0 && <li className="p-4 text-xs text-muted-foreground">No cases yet.</li>}
            </ul>
          </section>
        </div>

        {/* Right: case workspace */}
        <div className="space-y-4">
          {!selectedCase ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              <Bot className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              Select a case to start the AI browser agent.
            </div>
          ) : (
            <>
              {/* Case header */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{selectedCase.subject_name}</h2>
                    <a href={selectedCase.target_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />{selectedCase.target_url}</a>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${(STATUS_LABEL[selectedCase.status] ?? { tone: "bg-muted" }).tone}`}>{(STATUS_LABEL[selectedCase.status] ?? { label: selectedCase.status }).label}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => runStep("browse")} disabled={busy === "browse"} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
                    {busy === "browse" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />} Browse & Capture Evidence
                  </button>
                  <button onClick={() => runStep("contacts")} disabled={busy === "contacts"} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                    {busy === "contacts" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Discover Contacts
                  </button>
                </div>
                {selectedCase.page_title && (
                  <div className="mt-3 rounded-md bg-accent/40 p-3 text-xs">
                    <div className="font-medium">{selectedCase.page_title}</div>
                    {selectedCase.page_description && <div className="text-muted-foreground line-clamp-2 mt-0.5">{selectedCase.page_description}</div>}
                  </div>
                )}
              </div>

              {/* Evidence */}
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"><FileText className="h-3 w-3" /> Evidence ({evidence.length})</div>
                {evidence.length === 0 ? <div className="p-4 text-xs text-muted-foreground">No evidence captured. Click "Browse & Capture Evidence".</div> : (
                  <ul className="divide-y divide-border max-h-[260px] overflow-y-auto">
                    {evidence.map((e) => (
                      <li key={e.id} className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">{e.evidence_type.replace(/_/g, " ")}</span>
                          {e.source_url && <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary truncate">{e.source_url}</a>}
                        </div>
                        {e.evidence_type === "screenshot" && e.metadata?.screenshot_url && (
                          <img src={e.metadata.screenshot_url} alt="screenshot" className="mt-2 max-h-48 rounded border border-border" />
                        )}
                        {e.content && e.evidence_type !== "screenshot" && (
                          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground line-clamp-4">{e.content.slice(0, 600)}</pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Contacts */}
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Mail className="h-3 w-3" /> Contacts ({contacts.length})</div>
                {contacts.length === 0 ? <div className="p-4 text-xs text-muted-foreground">No contacts discovered yet.</div> : (
                  <ul className="divide-y divide-border max-h-[200px] overflow-y-auto">
                    {contacts.map((c) => (
                      <li key={c.id} className="p-3 text-xs flex items-start gap-2">
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{c.contact_type}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{c.value}</div>
                          {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary truncate block">source: {c.source_label} · {c.source_url}</a>}
                        </div>
                        {c.contact_type === "email" && (
                          <button onClick={() => setDraftRecipient(c.value)} className="text-[10px] rounded border border-border px-2 py-0.5 hover:bg-accent">Use</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Draft warning email */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Edit3 className="h-3 w-3" /> AI Warning Email Drafter</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <input value={draftRecipient} onChange={(e) => setDraftRecipient(e.target.value)} placeholder="recipient@channel.com" className="h-9 rounded border border-border bg-background px-2 text-xs" />
                  <input value={draftOwner} onChange={(e) => setDraftOwner(e.target.value)} placeholder="Rights owner name" className="h-9 rounded border border-border bg-background px-2 text-xs" />
                  <input type="number" min={24} max={168} value={draftDeadline} onChange={(e) => setDraftDeadline(Number(e.target.value))} className="h-9 rounded border border-border bg-background px-2 text-xs" />
                </div>
                <button onClick={() => runStep("draft")} disabled={busy === "draft"} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
                  {busy === "draft" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Generate AI Draft
                </button>

                <ul className="mt-4 space-y-3">
                  {emails.map((e) => (
                    <li key={e.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold uppercase">{e.status.replace(/_/g, " ")}</span>
                        {e.fair_use_flag && <span className="text-[10px] rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5 inline-flex items-center gap-1"><Scale className="h-3 w-3" />{e.fair_use_flag.replace(/_/g, " ")}</span>}
                        {e.risk_level && <span className="text-[10px] rounded-full bg-destructive/10 text-destructive px-2 py-0.5 inline-flex items-center gap-1"><ShieldAlert className="h-3 w-3" />{e.risk_level}</span>}
                        <span className="ml-auto text-[10px] text-muted-foreground">deadline {e.deadline_hours}h</span>
                      </div>
                      <div className="text-xs text-muted-foreground">To: <span className="text-foreground font-medium">{e.recipient_email}</span></div>
                      <div className="mt-1 text-xs font-semibold">{e.subject}</div>
                      <pre className="mt-2 whitespace-pre-wrap text-[11px] bg-accent/30 rounded p-2 max-h-60 overflow-y-auto">{e.body}</pre>
                      {e.status === "draft" && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button onClick={() => runStep("approve", e.id)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
                            <CheckCircle2 className="h-3 w-3" /> Approve & Mark Sent
                          </button>
                          <button onClick={() => runStep("legal", e.id)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                            <Scale className="h-3 w-3" /> Send to Legal Review
                          </button>
                          <button onClick={() => runStep("cancel", e.id)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[10px] text-muted-foreground flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> Drafts are never delivered automatically. Real SMTP delivery requires an email provider connection — this view is approval-only.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
