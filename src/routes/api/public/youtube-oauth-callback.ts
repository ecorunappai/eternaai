import { createFileRoute } from "@tanstack/react-router";

// Public OAuth callback — Google posts ?code=...&state=<userId>.<returnTo>
// Exchanges code for tokens, fetches channel info, stores encrypted tokens.

async function getKey(): Promise<CryptoKey> {
  const secret =
    process.env.YOUTUBE_OAUTH_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eterna-ai-fallback-key-please-set";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptToken(plain: string): Promise<string> {
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

async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }>;
}

async function fetchUserInfo(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ sub: string; email?: string; name?: string }>;
}

async function fetchPrimaryChannel(accessToken: string) {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }> };
  return json.items?.[0] ?? null;
}

export const Route = createFileRoute("/api/public/youtube-oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? "";
        const errorParam = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;
        const redirectUri = `${origin}/api/public/youtube-oauth-callback`;
        const [userId, ...rest] = state.split(".");
        const returnTo = rest.join(".") || "/takedown";

        const back = (status: string) =>
          Response.redirect(`${origin}${returnTo}?yt=${encodeURIComponent(status)}`, 302);

        if (errorParam) return back(`error_${errorParam}`);
        if (!code || !userId) return back("missing_code");

        try {
          const tokens = await exchangeCode(code, redirectUri);
          const info = await fetchUserInfo(tokens.access_token);
          const channel = await fetchPrimaryChannel(tokens.access_token);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const access_enc = await encryptToken(tokens.access_token);
          const refresh_enc = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null;
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          await supabaseAdmin.from("youtube_connections").upsert(
            {
              user_id: userId,
              google_account_id: info?.sub ?? null,
              email: info?.email ?? null,
              youtube_channel_id: channel?.id ?? null,
              youtube_channel_title: channel?.snippet?.title ?? null,
              access_token_encrypted: access_enc,
              refresh_token_encrypted: refresh_enc,
              token_expires_at: expiresAt,
              scopes: tokens.scope,
              status: "connected",
              connected_at: new Date().toISOString(),
              disconnected_at: null,
            },
            { onConflict: "user_id" },
          );

          return back("connected");
        } catch (e) {
          console.error("[youtube-oauth-callback]", e);
          return back("exchange_failed");
        }
      },
    },
  },
});
