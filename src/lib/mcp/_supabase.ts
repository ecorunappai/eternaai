// Helper: create a Supabase client that acts as the signed-in MCP user.
// The bearer token comes from the verified OAuth access token so RLS applies.
import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

export function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function notAuthed() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated" }],
    isError: true,
  };
}

export function dbError(message: string) {
  return {
    content: [{ type: "text" as const, text: `Database error: ${message}` }],
    isError: true,
  };
}
