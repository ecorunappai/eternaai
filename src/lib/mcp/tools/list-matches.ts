import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, dbError } from "../_supabase";

export default defineTool({
  name: "list_matches",
  title: "List discovered matches",
  description:
    "List discovered content matches (potential infringements) for the signed-in Eterna AI user, most recent first.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum number of matches to return (1-100)."),
    platform: z
      .string()
      .optional()
      .describe("Optional platform filter, e.g. 'youtube' or 'instagram'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, platform }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("discovered_matches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (platform) q = q.eq("platform", platform);
    const { data, error } = await q;
    if (error) return dbError(error.message);
    return {
      content: [{ type: "text", text: `Found ${data?.length ?? 0} matches.` }],
      structuredContent: { matches: data ?? [] },
    };
  },
});
