import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Instagram, Facebook, Youtube, Linkedin, Twitter, Globe, CheckCircle2, Plus } from "lucide-react";

export const Route = createFileRoute("/identity")({
  head: () => ({ meta: [{ title: "Digital Identity Registry — Eterna AI" }, { name: "description", content: "Connect and verify ownership of your social, web and brand identities." }] }),
  component: Identity,
});

const accounts = [
  { name: "Instagram", handle: "@arjun.rao", icon: Instagram, verified: true },
  { name: "YouTube", handle: "Arjun Rao Studio", icon: Youtube, verified: true },
  { name: "LinkedIn", handle: "/in/arjunrao", icon: Linkedin, verified: true },
  { name: "X", handle: "@arjunrao", icon: Twitter, verified: false },
  { name: "Facebook", handle: "Arjun Rao Official", icon: Facebook, verified: true },
  { name: "Website", handle: "arjunrao.studio", icon: Globe, verified: true },
];

function Identity() {
  return (
    <AppShell breadcrumb="Digital Identity">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Digital Identity Registry</h1>
          <p className="text-sm text-muted-foreground">Verified ownership for every channel, profile and domain you operate.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Plus className="h-4 w-4" /> Connect account
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.name} className="surface-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-primary">
                  <a.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.handle}</div>
                </div>
              </div>
              {a.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </span>
              ) : (
                <button className="rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">Verify</button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted p-2"><div className="font-semibold text-foreground">3</div><div className="text-muted-foreground">Fakes</div></div>
              <div className="rounded-lg bg-muted p-2"><div className="font-semibold text-foreground">128</div><div className="text-muted-foreground">Posts</div></div>
              <div className="rounded-lg bg-muted p-2"><div className="font-semibold text-foreground">A+</div><div className="text-muted-foreground">Health</div></div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
