import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Eterna AI" }] }),
  component: Settings,
});

function Settings() {
  return (
    <AppShell breadcrumb="Settings">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">Account, billing, notifications and team access.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { title: "Account", desc: "Profile, email & password" },
          { title: "Subscription", desc: "Starter · Professional · Business · Elite" },
          { title: "Notifications", desc: "Email, push and Slack alerts" },
          { title: "Team & roles", desc: "Invite collaborators and analysts" },
          { title: "API & webhooks", desc: "Programmatic access to Eterna AI" },
          { title: "Audit log", desc: "Every action across your workspace" },
        ].map((s) => (
          <div key={s.title} className="surface-card p-5 hover:border-primary/40 cursor-pointer">
            <div className="font-display text-base font-semibold">{s.title}</div>
            <div className="text-sm text-muted-foreground">{s.desc}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
