import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Award, Download, QrCode, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/certificates")({
  head: () => ({ meta: [{ title: "Ownership Certificates — Eterna AI" }, { name: "description", content: "Immutable digital ownership certificates with verifiable public links." }] }),
  component: Certificates,
});

const certs = [
  { id: "ETR-CERT-00214", asset: "Editorial Portrait #214", owner: "Arjun Rao", issued: "Nov 27, 2024" },
  { id: "ETR-CERT-00213", asset: "Brand Launch Reel", owner: "Arjun Rao", issued: "Nov 24, 2024" },
  { id: "ETR-CERT-00212", asset: "Podcast Ep. 14 — Master", owner: "Arjun Rao", issued: "Nov 19, 2024" },
];

function Certificates() {
  return (
    <AppShell breadcrumb="Certificates">
      <div>
        <h1 className="font-display text-2xl font-semibold">Digital Ownership Certificates</h1>
        <p className="text-sm text-muted-foreground">Each registered asset gets an immutable certificate with a public verification link.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {certs.map((c) => (
          <div key={c.id} className="surface-card overflow-hidden">
            <div className="p-5" style={{ background: "var(--gradient-subtle)" }}>
              <div className="flex items-center justify-between">
                <Award className="h-6 w-6 text-primary" />
                <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary border border-border">Verified</span>
              </div>
              <div className="mt-6 font-mono text-xs text-muted-foreground">{c.id}</div>
              <div className="font-display text-base font-semibold">{c.asset}</div>
            </div>
            <div className="grid grid-cols-3 gap-4 p-5">
              <div className="col-span-2 space-y-2 text-xs">
                <div><div className="text-muted-foreground">Owner</div><div className="font-medium text-foreground">{c.owner}</div></div>
                <div><div className="text-muted-foreground">Issued</div><div className="font-medium text-foreground">{c.issued}</div></div>
                <div className="truncate"><div className="text-muted-foreground">Verify</div><div className="font-mono text-[11px] text-primary">verify.eterna.ai/{c.id.toLowerCase()}</div></div>
              </div>
              <div className="grid place-items-center rounded-lg border border-border bg-muted">
                <QrCode className="h-12 w-12 text-foreground/70" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-border p-3">
              <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-xs font-medium hover:bg-accent">
                <Download className="h-3.5 w-3.5" /> PDF
              </button>
              <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
                <ShieldCheck className="h-3.5 w-3.5" /> Verify
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
