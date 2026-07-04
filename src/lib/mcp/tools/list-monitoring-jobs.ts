import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, dbError } from "../_supabase";

export default defineTool({
  name: "list_monitoring_jobs",
  title: "List monitoring jobs",
  description:
    "List background monitoring jobs (searches, crawls, scans) configured by the signed-in Eterna AI user.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await supabaseForUser(ctx)
      .from("monitoring_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return dbError(error.message);
    return {
      content: [
        { type: "text", text: `Found ${data?.length ?? 0} monitoring jobs.` },
      ],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
