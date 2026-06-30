import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Token encryption (AES-GCM, key derived from service-role secret) ----------
async function getKey(): Promise<CryptoKey> {
  const secret =
    process.env.YOUTUBE_OAUTH_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eterna-ai-fallback-key-please-set";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(plain: string): Promise<string> {
  if (!plain) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + enc.length);
  out.set(iv, 0);
  out.set(enc, iv.length);
  return btoa(String.fromCharCode(...out));
}

async function decryptToken(b64: string): Promise<string> {
  if (!b64) return "";
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const data = buf.slice(12);
  const key = await getKey();
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(dec);
}

export { encryptToken, decryptToken };

// ---------- OAuth config ----------
const YT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return { clientId, clientSecret, configured: !!(clientId && clientSecret) };
}

// ---------- 1. Read connection state ----------
export const getYoutubeConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("youtube_connections")
      .select("id, email, youtube_channel_id, youtube_channel_title, status, connected_at, disconnected_at, token_expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      connection: data,
      oauthConfigured: getOAuthConfig().configured,
    };
  });

// ---------- 2. Start OAuth: return Google authorization URL ----------
export const startYoutubeOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ returnTo: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientId, configured } = getOAuthConfig();
    if (!configured) {
      throw new Error(
        "Google OAuth is not configured. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in project secrets.",
      );
    }
    const origin = process.env.PUBLIC_APP_ORIGIN || process.env.SITE_URL || "";
    const redirectUri = `${origin || ""}/api/public/youtube-oauth-callback`;
    const state = `${context.userId}.${data.returnTo ?? "/takedown"}`;
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: YT_SCOPES,
      state,
    });
    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      redirectUri,
    };
  });

// ---------- 3. Disconnect ----------
export const disconnectYoutube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("youtube_connections")
      .update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        access_token_encrypted: null,
        refresh_token_encrypted: null,
      })
      .eq("user_id", userId);
    return { ok: true };
  });

// ---------- 4. Prepare a YouTube report payload for a takedown case ----------
export const prepareYoutubeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ takedownId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase
      .from("takedown_cases")
      .select("*")
      .eq("id", data.takedownId)
      .maybeSingle();
    if (!t || t.user_id !== userId) throw new Error("Takedown not found");

    const payload = {
      report_type: t.takedown_type,
      platform: t.platform,
      rights_owner_name: t.rights_owner_name,
      rights_owner_email: t.rights_owner_email,
      original_content_url: t.original_url,
      infringing_url: t.infringing_url,
      matched_timestamp: t.matched_at,
      similarity_score: t.similarity_score,
      certificate_id: t.certificate_id,
      evidence_urls: t.evidence_urls ?? [],
      description: t.violation_description,
      legal_declaration: t.legal_declaration,
      form_url:
        "https://www.youtube.com/copyright_complaint_form" /* canonical YT copyright form */,
    };

    await supabase
      .from("takedown_cases")
      .update({
        youtube_report_status: "waiting_user_review",
        youtube_report_prepared_at: new Date().toISOString(),
        youtube_report_payload: payload,
      })
      .eq("id", t.id);

    return payload;
  });

// ---------- 5. Mark report submitted (after user confirms in YouTube) ----------
export const markYoutubeReportSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ takedownId: z.string().uuid(), confirmationUrl: z.string().url().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase
      .from("takedown_cases")
      .select("user_id")
      .eq("id", data.takedownId)
      .maybeSingle();
    if (!t || t.user_id !== userId) throw new Error("Takedown not found");
    await supabase
      .from("takedown_cases")
      .update({
        youtube_report_status: "submitted",
        status: "submitted",
        submitted_at: new Date().toISOString(),
        confirmation_screenshot_url: data.confirmationUrl ?? null,
      })
      .eq("id", data.takedownId);
    return { ok: true };
  });
