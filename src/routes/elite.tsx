import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Crown, Headphones, ShieldCheck, Scale, FileSearch, Clock } from "lucide-react";

export const Route = createFileRoute("/elite")({
  head: () => ({ meta: [{ title: "Elite Protection — Eterna AI" }, { name: "description", content: "White-glove protection for high-profile creators, celebrities and enterprise clients." }] }),
  component: Elite,
});

function Elite() {
  return (
    <AppShell breadcrumb="Elite Protection">
      <div className="surface-card overflow-hidden">
        <div className="relative p-8 md:p-10" style={{ background: "var(--gradient-violet)" }}>
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 20% 20%, white, transparent 40%)" }} />
          <div className="relative max-w-2xl text-primary-foreground">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
              <Crown className="h-3.5 w-3.5" /> Elite Protection
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold md:text-4xl">White-glove protection for what matters most.</h1>
            <p className="mt-2 text-sm text-white/85 md:text-base">A dedicated team of reputation analysts, forensics specialists and legal advisors — assigned to your account.</p>
            <div className="mt-6 flex items-center gap-3">
              <button className="rounded-lg bg-white px-5 h-11 text-sm font-semibold text-primary">Upgrade — ₹50,000 / 3 months</button>
              <button className="rounded-lg border border-white/30 px-5 h-11 text-sm font-medium text-white hover:bg-white/10">Talk to specialist</button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          { icon: Headphones, title: "Dedicated Manager", desc: "Single point of contact for every case and escalation." },
          { icon: ShieldCheck, title: "Priority Monitoring", desc: "Higher scan frequency, faster detection windows." },
          { icon: Clock, title: "Priority Enforcement", desc: "First-in-queue takedowns and rapid response SLAs." },
          { icon: Scale, title: "Legal Coordination", desc: "Direct collaboration with our partner law network." },
          { icon: FileSearch, title: "Quarterly Reports", desc: "Executive briefings, threat landscape & ROI." },
          { icon: Crown, title: "Faster Escalation", desc: "Direct lines into platform trust & safety teams." },
        ].map((f) => (
          <div key={f.title} className="surface-card p-5">
            <div className="grid h-10 w-10 place-items-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-display text-base font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
