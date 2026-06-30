import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Gavel, FileCheck2, Send, BotMessageSquare } from "lucide-react";

export const Route = createFileRoute("/enforcement")({
  head: () => ({ meta: [{ title: "Enforcement & Legal — Eterna AI" }, { name: "description", content: "Automated takedowns, DMCA notices and legal coordination." }] }),
  component: Enforcement,
});

const actions = [
  { id: "ENF-2241", type: "DMCA Notice", platform: "YouTube", target: "VIO-8807", status: "Awaiting approval" },
  { id: "ENF-2240", type: "Impersonation Report", platform: "Instagram", target: "VIO-8821", status: "Submitted" },
  { id: "ENF-2238", type: "Cease & Desist", platform: "Website", target: "VIO-8799", status: "Drafting" },
  { id: "ENF-2231", type: "Copyright Report", platform: "TikTok", target: "VIO-8814", status: "Acknowledged" },
];

function Enforcement() {
  return (
    <AppShell breadcrumb="Enforcement">
      <div>
        <h1 className="font-display text-2xl font-semibold">AI Enforcement Agent</h1>
        <p className="text-sm text-muted-foreground">Browser automation drafts and submits takedowns. You approve before anything sends.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { icon: BotMessageSquare, title: "Auto-drafted notices", value: "38" },
          { icon: Send, title: "Submitted (30d)", value: "194" },
          { icon: FileCheck2, title: "Avg. takedown time", value: "26h" },
        ].map((k) => (
          <div key={k.title} className="surface-card p-5">
            <k.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 font-display text-2xl font-semibold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.title}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="surface-card p-6 lg:col-span-2">
          <h3 className="font-display text-lg font-semibold">Enforcement queue</h3>
          <div className="mt-4 divide-y divide-border">
            {actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-3.5">
                <div>
                  <div className="text-sm font-semibold">{a.type} <span className="ml-2 font-mono text-[11px] text-muted-foreground">{a.id}</span></div>
                  <div className="text-xs text-muted-foreground">{a.platform} · against {a.target}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">{a.status}</span>
                  <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>Review</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card p-6">
          <Gavel className="h-6 w-6 text-primary" />
          <h3 className="mt-3 font-display text-lg font-semibold">Legal Action Center</h3>
          <p className="mt-1 text-sm text-muted-foreground">Generate DMCA, copyright, impersonation and brand-misuse notices as ready-to-send PDFs.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {["DMCA Notice","Copyright Notice","Cease & Desist","Impersonation Notice","Brand Misuse Notice"].map((t) => (
              <li key={t} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                {t}
                <button className="text-xs font-medium text-primary hover:underline">Generate</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
