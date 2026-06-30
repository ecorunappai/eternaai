import { createFileRoute } from "@tanstack/react-router";
import { ScanSearch, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "AI Monitoring — Eterna AI" }] }),
  component: Monitoring,
});

const ENGINES = [
  { name: "Perceptual image hash (pHash)", load: 78, status: "active" },
  { name: "CLIP visual similarity", load: 64, status: "active" },
  { name: "Video fingerprinting", load: 41, status: "active" },
  { name: "Audio fingerprinting", load: 28, status: "active" },
  { name: "Text & caption matching", load: 55, status: "active" },
  { name: "Brand & logo detection", load: 33, status: "active" },
];
const PLATFORMS = ["Instagram", "YouTube", "TikTok", "X", "Facebook", "Reddit", "Pinterest", "LinkedIn", "Snapchat", "Threads", "Marketplaces", "Open web"];

function Monitoring() {
  return (
    <AppShell title="AI Monitoring">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">AI Monitoring Engines</h1>
        <p className="text-sm text-muted-foreground">Continuous scanning across {PLATFORMS.length} platforms.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ENGINES.map((e) => (
          <div key={e.name} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium">{e.name}</div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${e.load}%`, background: "var(--gradient-violet)" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground"><span>Compute load</span><span>{e.load}%</span></div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 font-medium"><ScanSearch className="h-4 w-4 text-primary" />Platform coverage</div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {PLATFORMS.map((p) => (
            <div key={p} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{p}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
