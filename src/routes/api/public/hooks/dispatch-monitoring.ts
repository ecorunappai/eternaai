// Public cron endpoint: dispatches due monitoring jobs.
// Called by pg_cron every 5 minutes. Authentication is via Supabase anon key.
import { createFileRoute } from "@tanstack/react-router";
import { dispatchDueMonitoringJobs } from "@/lib/monitoring-jobs.functions";

export const Route = createFileRoute("/api/public/hooks/dispatch-monitoring")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey) return new Response("Missing apikey", { status: 401 });
        try {
          const res = await dispatchDueMonitoringJobs();
          return new Response(JSON.stringify({ ok: true, ...res }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
