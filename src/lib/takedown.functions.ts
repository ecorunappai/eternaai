// Eterna AI — Takedown AI Agent (human-approval gated)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export const TAKEDOWN_FORM_URLS: Record<string, string> = {
  youtube_copyright: "https://www.youtube.com/copyright_complaint_form",
  youtube_privacy: "https://support.google.com/youtube/answer/142443",
  youtube_impersonation: "https://support.google.com/youtube/contact/impersonation",
  instagram_copyright: "https://help.instagram.com/contact/372592039493026",
  facebook_copyright: "https://www.facebook.com/help/contact/1758255661104383",
  tiktok_copyright: "https://www.tiktok.com/legal/report/Copyright",
  website_dmca: "mailto:abuse@hostingprovider.example",
  hosting_abuse: "mailto:abuse@hostingprovider.example",
  google_delisting: "https://reportcontent.google.com/forms/dmca_search",
};

export const TAKEDOWN_LABELS: Record<string, string> = {
  youtube_copyright: "YouTube Copyright Complaint",
  youtube_privacy: "YouTube Privacy Complaint",
  youtube_impersonation: "YouTube Impersonation Report",
  instagram_copyright: "Instagram Copyright Report",
  facebook_copyright: "Facebook Copyright Report",
  tiktok_copyright: "TikTok Copyright Report",
  website_dmca: "Website DMCA Notice",
  hosting_abuse: "Hosting Provider Abuse Notice",
  google_delisting: "Google Search Delisting Request",
};

// ============= 1. Prepare a takedown package from an enforcement case =============
export const prepareTakedown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().uuid(),
    takedownType: z.enum([
      "youtube_copyright","youtube_privacy","youtube_impersonation",
      "instagram_copyright","facebook_copyright","tiktok_copyright",
      "website_dmca","hosting_abuse","google_delisting",
    ]),
    rightsOwnerName: z.string().min(1).max(160),
    rightsOwnerEmail: z.string().email(),
    assignedManager: z.string().max(160).optional(),
    requireWarning: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: c } = await supabase.from("enforcement_cases").select("*").eq("id", data.caseId).maybeSingle();
    if (!c || c.user_id !== userId) throw new Error("Case not found");

    // Pull match + asset + certificate + evidence + warning email
    const [matchRes, evidenceRes, emailRes] = await Promise.all([
      c.match_id ? supabase.from("discovered_matches").select("*").eq("id", c.match_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("case_evidence").select("*").eq("case_id", c.id),
      supabase.from("warning_emails").select("*").eq("case_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const match = matchRes.data;
    const evidence = evidenceRes.data ?? [];
    const warning = emailRes.data;

    let certificate: any = null;
    let asset: any = null;
    if (c.asset_id) {
      const aRes = await supabase.from("assets").select("*").eq("id", c.asset_id).maybeSingle();
      asset = aRes.data;
      const certRes = await supabase.from("certificates").select("*").eq("asset_id", c.asset_id).maybeSingle();
      certificate = certRes.data;
    }

    // Check required data
    const missing: string[] = [];
    if (!data.rightsOwnerName) missing.push("rights_owner_name");
    if (!data.rightsOwnerEmail) missing.push("rights_owner_email");
    if (!c.target_url) missing.push("infringing_url");
    if (!asset && !certificate) missing.push("ownership_proof");
    if (!evidence.length) missing.push("evidence_screenshot");
    if (data.requireWarning && !warning) missing.push("warning_email_history");

    const evidenceUrls = evidence
      .map((e: any) => e.metadata?.screenshot_url || e.source_url)
      .filter(Boolean);

    const originalUrl = asset?.source_url || (certificate ? `${typeof window === "undefined" ? "" : window.location.origin}/verify/${certificate.certificate_number}` : null);

    // Auto-draft violation description + legal declaration via AI (with fallback)
    let description = `Unauthorized use of copyrighted/personal content owned by ${data.rightsOwnerName}. The infringing URL (${c.target_url}) reproduces protected material without permission, license, or fair-use justification. Ownership is evidenced by registered certificate${certificate ? ` #${certificate.certificate_number}` : ""} and original source material.`;
    let legalDeclaration = `I, ${data.rightsOwnerName}, state under penalty of perjury that I am the owner or authorized representative of the rights holder of the content identified above. I have a good faith belief that the use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law. The information in this notification is accurate.`;
    let riskWarnings = "Filing a knowingly false takedown notice may result in legal liability. Confirm ownership, fair-use review, and counter-notice exposure before submission.";

    try {
      const key = process.env.LOVABLE_API_KEY;
      if (key) {
        const gateway = createLovableAiGatewayProvider(key);
        const r = await generateText({
          model: gateway("google/gemini-2.5-flash"),
          temperature: 0.3,
          maxRetries: 1,
          messages: [{ role: "user", content:
`Draft a takedown package for platform "${TAKEDOWN_LABELS[data.takedownType]}".
Rights owner: ${data.rightsOwnerName}
Original/source: ${originalUrl ?? "(registered ownership certificate on file)"}
Infringing URL: ${c.target_url}
Page title: ${c.page_title ?? "(unknown)"}
Similarity score: ${match?.confidence_score ?? "(n/a)"}
Subject/channel: ${c.subject_name ?? "(unknown)"}

Return ONLY JSON: {"description":"...","legal_declaration":"...","risk_warnings":"..."}
- description: 2-4 sentences specific to the infringing URL, naming the content type
- legal_declaration: formal good-faith statement under penalty of perjury, signed by rights owner
- risk_warnings: 1-2 sentences on fair-use, counter-notice, and false-claim liability`
          }],
        });
        const raw = (r.text ?? "").trim();
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          if (parsed.description) description = String(parsed.description).slice(0, 2000);
          if (parsed.legal_declaration) legalDeclaration = String(parsed.legal_declaration).slice(0, 2000);
          if (parsed.risk_warnings) riskWarnings = String(parsed.risk_warnings).slice(0, 1000);
        }
      }
    } catch (e) {
      console.error("Takedown AI draft fallback:", e);
    }

    // Pre-fill platform form fields
    const formFields: Record<string, string> = {
      full_legal_name: data.rightsOwnerName,
      contact_email: data.rightsOwnerEmail,
      copyright_owner: data.rightsOwnerName,
      original_work_url: originalUrl ?? "(see attached certificate)",
      original_work_description: asset?.title ?? "Registered original content",
      infringing_url: c.target_url,
      description_of_infringement: description,
      sworn_statement: legalDeclaration,
      signature: data.rightsOwnerName,
      country: "—",
    };

    const status = missing.length ? "evidence_missing" : "waiting_approval";

    const { data: row, error } = await supabase.from("takedown_cases").insert({
      user_id: userId,
      case_id: c.id,
      match_id: c.match_id,
      asset_id: c.asset_id,
      certificate_id: certificate?.id ?? null,
      platform: c.platform ?? (data.takedownType.startsWith("youtube") ? "YouTube" : data.takedownType.split("_")[0]),
      takedown_type: data.takedownType,
      status,
      rights_owner_name: data.rightsOwnerName,
      rights_owner_email: data.rightsOwnerEmail,
      original_url: originalUrl,
      infringing_url: c.target_url,
      violation_description: description,
      similarity_score: match?.confidence_score ?? null,
      matched_at: match?.created_at ?? null,
      evidence_urls: evidenceUrls,
      form_url: TAKEDOWN_FORM_URLS[data.takedownType],
      form_fields: formFields,
      legal_declaration: legalDeclaration,
      risk_warnings: riskWarnings,
      assigned_manager: data.assignedManager ?? null,
      missing_fields: missing,
      warning_email_id: warning?.id ?? null,
      warning_sent_at: warning?.approved_at ?? warning?.created_at ?? null,
      response_deadline: warning ? new Date(Date.now() + (warning.deadline_hours ?? 72) * 3600 * 1000).toISOString() : null,
    }).select("*").maybeSingle();
    if (error) throw error;

    return row!;
  });

// ============= 2. Manager approval / edit / submit =============
export const reviewTakedown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    takedownId: z.string().uuid(),
    action: z.enum(["approve_submit", "edit", "legal_review", "cancel", "mark_submitted", "mark_removed", "mark_rejected"]),
    formFields: z.record(z.string(), z.string()).optional(),
    description: z.string().max(4000).optional(),
    legalDeclaration: z.string().max(4000).optional(),
    confirmationScreenshotUrl: z.string().url().optional(),
    approver: z.string().max(160).optional(),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase.from("takedown_cases").select("*").eq("id", data.takedownId).maybeSingle();
    if (!t || t.user_id !== userId) throw new Error("Takedown not found");

    const patch: any = { updated_at: new Date().toISOString() };
    if (data.formFields) patch.form_fields = { ...(t.form_fields ?? {}), ...data.formFields };
    if (data.description) patch.violation_description = data.description;
    if (data.legalDeclaration) patch.legal_declaration = data.legalDeclaration;
    if (data.notes) patch.notes = data.notes;

    switch (data.action) {
      case "approve_submit":
        if ((t.missing_fields ?? []).length) throw new Error("Cannot start takedown. Missing required evidence.");
        patch.status = "submitted";
        patch.approved_at = new Date().toISOString();
        patch.approved_by = data.approver ?? "manager";
        patch.submitted_at = new Date().toISOString();
        if (data.confirmationScreenshotUrl) patch.confirmation_screenshot_url = data.confirmationScreenshotUrl;
        break;
      case "mark_submitted":
        patch.status = "submitted";
        patch.submitted_at = new Date().toISOString();
        if (data.confirmationScreenshotUrl) patch.confirmation_screenshot_url = data.confirmationScreenshotUrl;
        break;
      case "edit": patch.status = "preparing_form"; break;
      case "legal_review": patch.status = "escalated_legal"; break;
      case "cancel": patch.status = "rejected"; break;
      case "mark_removed": patch.status = "removed"; break;
      case "mark_rejected": patch.status = "rejected"; break;
    }

    const { error } = await supabase.from("takedown_cases").update(patch).eq("id", t.id);
    if (error) throw error;
    return { status: patch.status ?? t.status };
  });
