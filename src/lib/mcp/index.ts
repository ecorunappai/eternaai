import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMatches from "./tools/list-matches";
import listEnforcementCases from "./tools/list-enforcement-cases";
import listTakedowns from "./tools/list-takedowns";
import listMonitoringJobs from "./tools/list-monitoring-jobs";
import listAssets from "./tools/list-assets";

// Direct Supabase host is required — the .lovable.cloud proxy fails RFC 8414
// issuer verification. Read the project ref from a Vite-inlined env var.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "eterna-ai-mcp",
  title: "Eterna AI",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in Eterna AI user's content protection workflow: registered assets, monitoring jobs, discovered matches, enforcement cases, and takedown drafts. Takedowns are never auto-submitted from MCP — human approval is required inside the app.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listAssets,
    listMonitoringJobs,
    listMatches,
    listEnforcementCases,
    listTakedowns,
  ],
});
