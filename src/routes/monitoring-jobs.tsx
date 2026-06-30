import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Trash2, RefreshCw, Calendar, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import {
  listMonitoringJobs,
  pauseMonitoringJob,
  deleteMonitoringJob,
  runMonitoringJobNow,
} from "@/lib/monitoring-jobs.functions";

export const Route = createFileRoute("/monitoring-jobs")({
  head: () => ({ meta: [{ title: "Auto-Monitoring — Eterna AI" }] }),
  component: MonitoringJobsPage,
});

function MonitoringJobsPage() {
  const list = useServerFn(listMonitoringJobs);
  const pause = useServerFn(pauseMonitoringJob);
  const del = useServerFn(deleteMonitoringJob);
  const runNow = useServerFn(runMonitoringJobNow);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await list();
      setJobs(res.jobs ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function onRun(j: any) {
    setBusy(j.id);
    try {
      const r = await runNow({ data: { id: j.id } });
      if (r.offline) toast.error(`Agent offline: ${r.reason}`);
      else toast.success(r.queued ? "Queued — another task is active" : "Task started");
      reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <AppShell title="Auto-Monitoring">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Auto-Monitoring Jobs</h1>
          <p className="text-sm text-muted-foreground">
            System-generated scans from Content Registry. Only one agent task runs at a time — the rest stay queued.
          </p>
        </div>
        <button onClick={reload} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No monitoring jobs yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Register an asset in Content Registry and enable auto-monitoring to start.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Asset</th>
                <th className="text-left p-3">Scan</th>
                <th className="text-left p-3">Frequency</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Last run</th>
                <th className="text-left p-3">Next run</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-accent/30">
                  <td className="p-3 font-medium">
                    {j.asset_name}
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{j.source.replace("_", " ")}</div>
                  </td>
                  <td className="p-3">{j.scan_type.replace(/_/g, " ")}</td>
                  <td className="p-3 capitalize">{j.frequency}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${j.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      ● {j.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{j.last_run_at ? new Date(j.last_run_at).toLocaleString() : "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground"><Calendar className="inline h-3 w-3 mr-1" />{new Date(j.next_run_at).toLocaleString()}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => onRun(j)} disabled={busy === j.id} className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mr-3 disabled:opacity-50">
                      {busy === j.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run now
                    </button>
                    <button onClick={async () => { await pause({ data: { id: j.id, status: j.status === "active" ? "paused" : "active" } }); reload(); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mr-3">
                      <Pause className="h-3 w-3" /> {j.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button onClick={async () => { if (confirm("Delete this monitoring job?")) { await del({ data: { id: j.id } }); reload(); } }} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
