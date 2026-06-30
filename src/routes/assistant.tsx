import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Sparkles, Send } from "lucide-react";

export const Route = createFileRoute("/assistant")({
  head: () => ({ meta: [{ title: "AI Assistant — Eterna AI" }, { name: "description", content: "Ask Eterna AI to surface violations, draft notices and generate reports." }] }),
  component: Assistant,
});

const prompts = [
  "Show all copyright violations from this week.",
  "Find fake profiles impersonating me on Instagram.",
  "Generate a DMCA takedown for VIO-8807.",
  "List the highest-risk threats right now.",
  "Generate a brand misuse legal notice.",
];

function Assistant() {
  return (
    <AppShell breadcrumb="AI Assistant">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold">Ask Eterna</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your protection co-pilot. Trained on your assets, cases and the entire enforcement library.</p>
        </div>

        <div className="mt-8 surface-card p-2">
          <div className="flex items-center gap-2 p-2">
            <input placeholder="Ask anything about your protection…" className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground" />
            <button className="inline-flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
              <Send className="h-4 w-4" /> Send
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Suggested</div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {prompts.map((p) => (
              <button key={p} className="rounded-xl border border-border bg-card p-4 text-left text-sm hover:border-primary/40 hover:bg-accent/40">
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
