// Eterna AI — Instagram monitor account status proxy.
// Talks to the Browser Agent's /integrations/instagram/status endpoint.
// Never returns credentials, only username + connection state.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InstagramMonitorStatus = {
  configured: boolean;
  online: boolean;
  username: string | null;
  state:
    | "not_configured"
    | "logged_out"
    | "logged_in"
    | "needs_verification"
    | "error"
    | "agent_offline";
  lastLoginAt: string | null;
  lastError: string | null;
};

export const getInstagramMonitorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<InstagramMonitorStatus> => {
    const baseUrl = process.env.BROWSER_AGENT_URL;
    const token = process.env.BROWSER_AGENT_TOKEN ?? "";
    if (!baseUrl) {
      return {
        configured: false,
        online: false,
        username: null,
        state: "agent_offline",
        lastLoginAt: null,
        lastError: "Browser Agent not configured",
      };
    }
    try {
      const res = await fetch(
        `${baseUrl.replace(/\/$/, "")}/integrations/instagram/status`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) {
        return {
          configured: false,
          online: false,
          username: null,
          state: "agent_offline",
          lastLoginAt: null,
          lastError: `Agent HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as Omit<InstagramMonitorStatus, "online">;
      return { ...data, online: true };
    } catch (e) {
      return {
        configured: false,
        online: false,
        username: null,
        state: "agent_offline",
        lastLoginAt: null,
        lastError: (e as Error).message,
      };
    }
  });
