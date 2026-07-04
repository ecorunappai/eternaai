import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, dbError } from "../_supabase";

export default defineTool({
  name: "list_takedowns",
  title: "List takedown cases",
  description:
    "List YouTube / platform copyright takedown cases prepared inside Eterna AI. Never auto-submits — human approval required to file.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await supabaseForUser(ctx)
      .from("takedown_cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return dbError(error.message);
    return {
      content: [
        { type: "text", text: `Found ${data?.length ?? 0} takedown cases.` },
      ],
      structuredContent: { takedowns: data ?? [] },
    };
  },
});
