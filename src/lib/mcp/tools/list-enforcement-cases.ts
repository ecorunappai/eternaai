import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, dbError } from "../_supabase";

export default defineTool({
  name: "list_enforcement_cases",
  title: "List enforcement cases",
  description:
    "List enforcement cases (open takedown / DMCA / warning workflows) for the signed-in Eterna AI user.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20),
    status: z
      .string()
      .optional()
      .describe("Optional status filter (e.g. 'open', 'resolved')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("enforcement_cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return dbError(error.message);
    return {
      content: [
        { type: "text", text: `Found ${data?.length ?? 0} enforcement cases.` },
      ],
      structuredContent: { cases: data ?? [] },
    };
  },
});
