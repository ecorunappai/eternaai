// Eterna AI — Browser Agent + Warning Email Agent (Firecrawl-powered, human-approval gated)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const FIRECRAWL = "https://api.firecrawl.dev/v2/scrape";

async function firecrawl(url: string, opts: { formats?: string[]; waitFor?: number } = {}) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Firecrawl is not connected.");
  const res = await fetch(FIRECRAWL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      url,
      formats: opts.formats ?? ["markdown", "links", "screenshot"],
      onlyMainContent: false,
      waitFor: opts.waitFor ?? 2500,
      timeout: 40000,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  return j?.data ?? j;
}

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "x.com", "twitter.com", "linktr.ee", "beacons.ai", "linkedin.com", "tiktok.com"];

function extractEmails(text: string): string[] {
  const found = new Set<string>();
  const matches = text.match(EMAIL_RE) ?? [];
  matches.forEach((m) => {
    const lower = m.toLowerCase();
    if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".webp")) return;
    if (lower.includes("example.com") || lower.includes("sentry") || lower.includes("noreply")) return;
    found.add(lower);
  });
  return Array.from(found).slice(0, 8);
}

function extractSocialLinks(links: string[]): { url: string; host: string }[] {
  const seen = new Set<string>();
  const out: { url: string; host: string }[] = [];
  for (const l of links) {
    try {
      const u = new URL(l);
      const h = u.hostname.replace(/^www\./, "");
      if (!SOCIAL_HOSTS.some((s) => h.endsWith(s))) continue;
      const key = `${h}${u.pathname.split("/").slice(0, 3).join("/")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: u.toString(), host: h });
      if (out.length >= 12) break;
    } catch { /* skip */ }
  }
  return out;
}

// ============= 1. Open a case from a discovered match =============
export const openCaseFromMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m } = await supabase.from("discovered_matches").select("*").eq("id", data.matchId).maybeSingle();
    if (!m || m.user_id !== userId) throw new Error("Match not found");

    const existing = await supabase.from("enforcement_cases").select("id").eq("match_id", m.id).maybeSingle();
    if (existing.data) return { caseId: existing.data.id, reused: true };

    const channelUrl = m.video_id
      ? (m.channel_name ? `https://www.youtube.com/results?search_query=${encodeURIComponent(m.channel_name)}` : null)
      : null;

    const { data: c, error } = await supabase.from("enforcement_cases").insert({
      user_id: userId,
      match_id: m.id,
      asset_id: m.asset_id,
      subject_name: m.channel_name ?? m.video_title ?? "Unknown",
      target_url: m.source_url,
      channel_url: channelUrl,
      platform: m.platform ?? "YouTube",
      status: "queued",
      risk_level: m.risk_level,
    }).select("id").maybeSingle();
    if (error) throw error;
    return { caseId: c!.id, reused: false };
  });

// ============= 2. Investigate a case page (evidence + metadata) =============
export const investigateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c } = await supabase.from("enforcement_cases").select("*").eq("id", data.caseId).maybeSingle();
    if (!c || c.user_id !== userId) throw new Error("Case not found");

    await supabase.from("enforcement_cases").update({ status: "browsing", updated_at: new Date().toISOString() }).eq("id", c.id);

    let page: any;
    try {
      page = await firecrawl(c.target_url, { formats: ["markdown", "links", "screenshot"], waitFor: 3500 });
    } catch (e) {
      await supabase.from("enforcement_cases").update({ status: "blocked", notes: (e as Error).message }).eq("id", c.id);
      throw e;
    }

    const title = page?.metadata?.title ?? null;
    const description = page?.metadata?.description ?? null;
    const screenshot = page?.screenshot ?? null;
    const md: string = page?.markdown ?? "";
    const links: string[] = page?.links ?? [];

    // Evidence rows
    await supabase.from("case_evidence").insert([
      { case_id: c.id, user_id: userId, evidence_type: "page_metadata", source_url: c.target_url, content: `${title ?? ""}\n${description ?? ""}`.trim(), metadata: page?.metadata ?? {} },
      { case_id: c.id, user_id: userId, evidence_type: "visible_text", source_url: c.target_url, content: md.slice(0, 8000) },
      ...(screenshot ? [{ case_id: c.id, user_id: userId, evidence_type: "screenshot", source_url: c.target_url, content: typeof screenshot === "string" ? screenshot.slice(0, 500) : null, metadata: { screenshot_url: typeof screenshot === "string" ? screenshot : null } }] : []),
    ]);

    await supabase.from("enforcement_cases").update({
      status: "evidence_saved",
      page_title: title,
      page_description: description,
      screenshot_url: typeof screenshot === "string" ? screenshot : null,
      updated_at: new Date().toISOString(),
    }).eq("id", c.id);

    return { title, description, evidenceCount: 3, screenshot: typeof screenshot === "string" ? screenshot : null, snippet: md.slice(0, 400) };
  });

// ============= 3. Discover public contact details =============
export const discoverContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c } = await supabase.from("enforcement_cases").select("*").eq("id", data.caseId).maybeSingle();
    if (!c || c.user_id !== userId) throw new Error("Case not found");

    await supabase.from("enforcement_cases").update({ status: "contact_searching", updated_at: new Date().toISOString() }).eq("id", c.id);

    const urlsToTry = new Set<string>();
    // YouTube About page heuristic
    if (c.target_url?.includes("youtube.com") || c.target_url?.includes("youtu.be")) {
      if (c.subject_name) {
        urlsToTry.add(`https://www.youtube.com/results?search_query=${encodeURIComponent(c.subject_name + " channel about contact email")}`);
      }
    }
    urlsToTry.add(c.target_url);

    const allEmails = new Map<string, { source: string; label: string }>();
    const allSocials: { url: string; host: string; source: string }[] = [];

    for (const u of Array.from(urlsToTry).slice(0, 3)) {
      try {
        const page = await firecrawl(u, { formats: ["markdown", "links"], waitFor: 2000 });
        const md: string = (page?.markdown ?? "") + " " + JSON.stringify(page?.metadata ?? {});
        const links: string[] = page?.links ?? [];
        extractEmails(md).forEach((e) => allEmails.set(e, { source: u, label: "page text" }));
        extractEmails(links.join(" ")).forEach((e) => { if (!allEmails.has(e)) allEmails.set(e, { source: u, label: "links" }); });
        extractSocialLinks(links).forEach((s) => allSocials.push({ ...s, source: u }));
      } catch { /* continue */ }
    }

    // Follow Linktree-like aggregators for more emails
    const linktrees = allSocials.filter((s) => s.host.includes("linktr.ee") || s.host.includes("beacons.ai")).slice(0, 2);
    for (const lt of linktrees) {
      try {
        const page = await firecrawl(lt.url, { formats: ["markdown", "links"], waitFor: 1500 });
        extractEmails(((page?.markdown ?? "") + " " + (page?.links ?? []).join(" "))).forEach((e) => {
          if (!allEmails.has(e)) allEmails.set(e, { source: lt.url, label: "linktree" });
        });
      } catch { /* skip */ }
    }

    // Persist
    const emailRows = Array.from(allEmails.entries()).map(([email, meta]) => ({
      case_id: c.id, user_id: userId, contact_type: "email", value: email, source_url: meta.source, source_label: meta.label, verified: false,
    }));
    const socialRows = allSocials.slice(0, 10).map((s) => ({
      case_id: c.id, user_id: userId, contact_type: s.host.split(".")[0], value: s.url, source_url: s.source, source_label: s.host, verified: false,
    }));

    if (emailRows.length || socialRows.length) {
      // delete prior contacts to avoid duplicates
      await supabase.from("creator_contacts").delete().eq("case_id", c.id);
      await supabase.from("creator_contacts").insert([...emailRows, ...socialRows]);
    }

    await supabase.from("enforcement_cases").update({
      status: emailRows.length > 0 ? "contact_found" : "evidence_saved",
      updated_at: new Date().toISOString(),
    }).eq("id", c.id);

    return { emails: emailRows.length, socials: socialRows.length };
  });

// ============= 4. AI-draft warning email =============
const DraftSchema = z.object({
  subject: z.string().min(5).max(140),
  body: z.string().min(50).max(4000),
  fair_use_flag: z.enum(["clear_violation", "possible_fair_use", "needs_legal_review"]),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
});

export const draftWarningEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().uuid(),
    recipientEmail: z.string().email(),
    rightsOwnerName: z.string().min(1).max(120),
    deadlineHours: z.number().int().min(24).max(168).default(72),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c } = await supabase.from("enforcement_cases").select("*").eq("id", data.caseId).maybeSingle();
    if (!c || c.user_id !== userId) throw new Error("Case not found");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt =
`Draft a PROFESSIONAL, FIRM, NON-THREATENING copyright/content-misuse warning email from Eterna AI Protection Team on behalf of "${data.rightsOwnerName}".

Target page title: ${c.page_title ?? "(unknown)"}
Target page description: ${c.page_description ?? "(unknown)"}
Infringing URL: ${c.target_url}
Platform: ${c.platform ?? "unknown"}
Channel / subject: ${c.subject_name ?? "(unknown)"}
Removal deadline: ${data.deadlineHours} hours
Recipient: ${data.recipientEmail}

Requirements:
- Subject under 80 chars
- Body addresses recipient, names rights owner, includes infringing URL, requests removal within deadline, mentions evidence + ownership certificate placeholder "[Certificate Link]" and "[Evidence Link]"
- Note fair-use review window and reply path
- Polite, lawful, never threatening, never false claims
- Plain text only (no HTML)
- Classify fair_use_flag honestly: if page looks like a reaction/commentary/news, use possible_fair_use; if deepfake/impersonation/clear reupload, clear_violation; otherwise needs_legal_review
- risk_level: one of low | medium | high | critical

Respond with ONLY a single JSON object, no markdown, no commentary, matching exactly:
{"subject":"...","body":"...","fair_use_flag":"clear_violation|possible_fair_use|needs_legal_review","risk_level":"low|medium|high|critical"}`;

    // Deterministic fallback so the user always gets a usable email even if AI fails
    const fallback: z.infer<typeof DraftSchema> = {
      subject: `Urgent: Copyright / Content Misuse Notice — Removal Requested Within ${data.deadlineHours}h`,
      body:
`Dear ${data.recipientEmail.split("@")[0] || "Creator"},

We are writing on behalf of ${data.rightsOwnerName}, the verified rights owner of the original content referenced below. Eterna AI Protection Team monitors digital infringement on behalf of our client and has identified the following content as a potential unauthorized use of their copyrighted/personal material:

  • Infringing URL: ${c.target_url}
  • Page Title: ${c.page_title ?? "(captured during investigation)"}
  • Platform: ${c.platform ?? "Online"}
  • Subject / Channel: ${c.subject_name ?? "(see URL)"}

Ownership evidence and the registered ownership certificate are available here:
  • Ownership Certificate: [Certificate Link]
  • Evidence Bundle: [Evidence Link]

We respectfully request that you remove or restrict access to the infringing content within ${data.deadlineHours} hours of receipt of this notice. If you believe your use qualifies as fair use, commentary, news, or transformative work, please reply to this email within the same window with your justification so we may review before escalating.

Failure to respond may result in a formal DMCA / platform-level takedown request and, where applicable, further legal action.

This notice is sent in good faith. Nothing in this message constitutes a waiver of any rights, all of which are expressly reserved.

Sincerely,
Eterna AI Protection Team
on behalf of ${data.rightsOwnerName}`,
      fair_use_flag: "needs_legal_review",
      risk_level: "medium",
    };

    let draft: z.infer<typeof DraftSchema> = fallback;
    try {
      const result = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        temperature: 0.3,
        maxRetries: 2,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = (result.text ?? "").trim();
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch {
        const block = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const obj = raw.match(/\{[\s\S]*\}/);
        const cand = (block?.[1] ?? obj?.[0] ?? "").trim()
          .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        try { parsed = JSON.parse(cand); } catch { /* fall through */ }
      }
      if (parsed && typeof parsed === "object") {
        const safe = DraftSchema.safeParse(parsed);
        if (safe.success) draft = safe.data;
        else {
          draft = {
            subject: (parsed.subject?.toString().slice(0, 140)) || fallback.subject,
            body: (parsed.body?.toString().slice(0, 4000)) || fallback.body,
            fair_use_flag: (["clear_violation","possible_fair_use","needs_legal_review"].includes(parsed.fair_use_flag) ? parsed.fair_use_flag : fallback.fair_use_flag),
            risk_level: (["low","medium","high","critical"].includes(parsed.risk_level) ? parsed.risk_level : fallback.risk_level),
          };
        }
      }
    } catch (err) {
      console.error("AI draft failed, using deterministic fallback:", err);
    }


    const { data: row, error } = await supabase.from("warning_emails").insert({
      case_id: c.id,
      user_id: userId,
      recipient_email: data.recipientEmail,
      subject: draft.subject,
      body: draft.body,
      deadline_hours: data.deadlineHours,
      status: "draft",
      risk_level: draft.risk_level,
      fair_use_flag: draft.fair_use_flag,
    }).select("*").maybeSingle();
    if (error) throw error;

    await supabase.from("enforcement_cases").update({ status: "email_drafted", updated_at: new Date().toISOString() }).eq("id", c.id);
    return row!;
  });

// ============= 5. Human approval (no auto-send) =============
export const approveWarningEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    emailId: z.string().uuid(),
    action: z.enum(["approve_mark_sent", "legal_review", "cancel"]),
    editedSubject: z.string().optional(),
    editedBody: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: e } = await supabase.from("warning_emails").select("*").eq("id", data.emailId).maybeSingle();
    if (!e || e.user_id !== userId) throw new Error("Email not found");

    const patch: any = { updated_at: new Date().toISOString() };
    if (data.editedSubject) patch.subject = data.editedSubject;
    if (data.editedBody) patch.body = data.editedBody;

    if (data.action === "approve_mark_sent") {
      patch.status = "approved_pending_delivery";
      patch.approved_at = new Date().toISOString();
    } else if (data.action === "legal_review") {
      patch.status = "legal_review";
    } else {
      patch.status = "cancelled";
    }

    await supabase.from("warning_emails").update(patch).eq("id", e.id);
    if (data.action === "approve_mark_sent") {
      await supabase.from("enforcement_cases").update({ status: "waiting_approval_delivery", updated_at: new Date().toISOString() }).eq("id", e.case_id);
    }
    return { status: patch.status };
  });
