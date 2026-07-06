import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Radar, Building2, User, Briefcase, Sparkles, Megaphone } from "lucide-react";

export const Route = createFileRoute("/threat-scanner")({
  head: () => ({ meta: [{ title: "Threat Scanner — Eterna AI" }, { name: "description", content: "Launch targeted reputation scans across YouTube, Instagram, News, Reddit, X, TikTok and more." }] }),
  component: ThreatScannerPage,
});

const PRESETS = [
  { icon: User, title: "Scan Celebrity", desc: "Face, name, deepfakes, fake accounts, viral trolls." },
  { icon: Briefcase, title: "Scan Founder", desc: "News, LinkedIn impersonation, executive misinformation." },
  { icon: Building2, title: "Scan Company", desc: "Brand mentions, reputation attacks, boycott campaigns." },
  { icon: Sparkles, title: "Scan Brand", desc: "Logo misuse, counterfeit sites, brand-jacking." },
  { icon: Megaphone, title: "Scan Campaign", desc: "Hashtag hijacks, negative sentiment, viral criticism." },
];

function ThreatScannerPage() {
  return (
    <AppShell title="Threat Scanner">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Radar className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Threat Scanner</h1>
            <p className="text-sm text-muted-foreground">Fan out reputation-intelligence scans across 14+ platforms in one shot.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <Link key={p.title} to="/youtube" className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/50 transition-colors">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-3 font-medium">{p.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{p.desc}</div>
                <div className="mt-4 text-xs font-semibold text-primary">Launch scan →</div>
              </Link>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Every scan filters out neutral / promotional content and returns only items with a real reputational risk signal, ranked by <b className="text-foreground">Reputation Risk Score (0-100)</b>.
        </div>
      </div>
    </AppShell>
  );
}
