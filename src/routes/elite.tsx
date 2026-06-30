import { createFileRoute } from "@tanstack/react-router";
import { Crown, Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/elite")({
  head: () => ({ meta: [{ title: "Elite Protection — Eterna AI" }] }),
  component: Elite,
});

const FEATURES = [
  "Dedicated digital protection analyst",
  "Priority enforcement queue (<2h response)",
  "Legal coordination with partner counsel",
  "Custom AI monitoring rules",
  "Quarterly threat intelligence reports",
  "White-glove onboarding & training",
];

function Elite() {
  return (
    <AppShell title="Elite Protection">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl p-10 text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Crown className="h-8 w-8" />
          <h1 className="mt-4 font-display text-3xl font-semibold">Elite Protection</h1>
          <p className="mt-2 text-white/85 max-w-xl">A white-glove, human-led layer on top of Eterna AI — for public figures, executive teams, and high-value IP.</p>
          <div className="mt-6 inline-flex items-baseline gap-2">
            <span className="font-display text-4xl font-semibold">₹50,000</span><span className="text-white/70 text-sm">/ quarter</span>
          </div>
          <button className="mt-6 h-11 rounded-lg bg-white px-6 text-sm font-semibold text-primary">Request Invite</button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
              <Check className="h-4 w-4 text-primary" />{f}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
