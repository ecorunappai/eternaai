import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AlertOctagon, ExternalLink, Filter } from "lucide-react";

export const Route = createFileRoute("/violations")({
  head: () => ({ meta: [{ title: "Violation Center — Eterna AI" }, { name: "description", content: "Review, triage and enforce action on detected violations." }] }),
  component: Violations,
});

const cases = [
  { id: "VIO-8821", platform: "Instagram", asset: "Hero portrait #214", sim: 96, threat: "High", status: "Enforcement", date: "2h ago" },
  { id: "VIO-8814", platform: "TikTok", asset: "Brand reel — launch", sim: 92, threat: "Critical", status: "Warning Sent", date: "4h ago" },
  { id: "VIO-8807", platform: "YouTube", asset: "Podcast ep. 14", sim: 88, threat: "Medium", status: "Under Review", date: "9h ago" },
  { id: "VIO-8799", platform: "Website", asset: "Product photo set", sim: 99, threat: "Critical", status: "Detected", date: "12h ago" },
  { id: "VIO-8782", platform: "X", asset: "Profile identity", sim: 84, threat: "High", status: "Removed", date: "1d ago" },
  { id: "VIO-8771", platform: "Facebook", asset: "Campaign artwork", sim: 79, threat: "Medium", status: "Resolved", date: "2d ago" },
  { id: "VIO-8760", platform: "TikTok", asset: "Tutorial short #8", sim: 91, threat: "High", status: "Enforcement", date: "3d ago" },
];

const threatColor = (t: string) =>
  t === "Critical" ? "bg-destructive/10 text-destructive" :
  t === "High" ? "bg-warning/15 text-warning-foreground" :
  t === "Medium" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground";

function Violations() {
  return (
    <AppShell breadcrumb="Violation Center">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Violation Center</h1>
          <p className="text-sm text-muted-foreground">Every detection becomes a case with evidence, screenshots and a clear next step.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 h-10 text-sm hover:bg-accent"><Filter className="h-4 w-4" /> Filter</button>
          <button className="inline-flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>Bulk enforce</button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Open cases", value: "47" },
          { label: "Critical", value: "8", tone: "text-destructive" },
          { label: "Awaiting review", value: "14" },
          { label: "Resolved (30d)", value: "182", tone: "text-success" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5">
            <AlertOctagon className="h-5 w-5 text-primary" />
            <div className={`mt-3 font-display text-2xl font-semibold ${s.tone ?? ""}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3 font-semibold">Case</th>
              <th className="px-4 py-3 font-semibold">Platform</th>
              <th className="px-4 py-3 font-semibold">Asset</th>
              <th className="px-4 py-3 font-semibold">Similarity</th>
              <th className="px-4 py-3 font-semibold">Threat</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Detected</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {cases.map((v) => (
              <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-6 py-3.5 font-mono text-xs font-semibold">{v.id}</td>
                <td className="px-4 py-3.5 text-xs">{v.platform}</td>
                <td className="px-4 py-3.5 text-xs">{v.asset}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${v.sim}%`, background: "var(--gradient-violet)" }} />
                    </div>
                    <span className="text-xs font-medium">{v.sim}%</span>
                  </div>
                </td>
                <td className="px-4 py-3.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${threatColor(v.threat)}`}>{v.threat}</span></td>
                <td className="px-4 py-3.5 text-xs">{v.status}</td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">{v.date}</td>
                <td className="px-6 py-3.5 text-right">
                  <button className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">
                    Open <ExternalLink className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
