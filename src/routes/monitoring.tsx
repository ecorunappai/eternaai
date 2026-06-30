import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ScanSearch, Globe, Image as ImageIcon, Video, Type, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "AI Monitoring — Eterna AI" }, { name: "description", content: "Continuous AI-powered monitoring across social, search, web and marketplaces." }] }),
  component: Monitoring,
});

function Monitoring() {
  return (
    <AppShell breadcrumb="AI Monitoring">
      <div>
        <h1 className="font-display text-2xl font-semibold">AI Monitoring Engine</h1>
        <p className="text-sm text-muted-foreground">Image, video, text and reputation agents running 24/7 across platforms.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: ImageIcon, name: "Image Detection", desc: "pHash · dHash · CLIP similarity", scans: "184k / day" },
          { icon: Video, name: "Video Detection", desc: "Keyframe fingerprints · trims · edits", scans: "62k / day" },
          { icon: Type, name: "Text Detection", desc: "Plagiarism · unauthorized publishing", scans: "240k / day" },
          { icon: ShieldAlert, name: "Reputation Shield", desc: "Sentiment · virality · threat score", scans: "98k / day" },
        ].map((a) => (
          <div key={a.name} className="surface-card p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
                <a.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.desc}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{a.scans}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 surface-card p-6">
        <h3 className="font-display text-lg font-semibold">Coverage</h3>
        <p className="text-xs text-muted-foreground">Sources scanned by Eterna AI agents</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {["Instagram","Facebook","TikTok","YouTube","X","LinkedIn","Threads","Google","Bing","Marketplaces","Blogs & Forums","News Sites"].map((p) => (
            <div key={p} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
              <Globe className="h-4 w-4 text-primary" /> {p}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 surface-card p-6 text-center">
        <ScanSearch className="mx-auto h-8 w-8 text-primary" />
        <h3 className="mt-2 font-display text-lg font-semibold">Add a new monitoring job</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Target a specific asset, profile or keyword. Eterna AI will continuously sweep across all enabled sources.</p>
        <button className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>Create job</button>
      </div>
    </AppShell>
  );
}
