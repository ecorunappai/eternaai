import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify/$certId")({
  head: ({ params }) => ({ meta: [{ title: `Verify ${params.certId} — Eterna AI` }] }),
  component: Verify,
});

function Verify() {
  const { certId } = Route.useParams();
  const [cert, setCert] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("certificates").select("*, assets(title, asset_type, sha256, created_at)").eq("certificate_number", certId).maybeSingle()
      .then(({ data }) => { setCert(data); setLoading(false); });
  }, [certId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="p-6 text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5" />
            <div className="font-display text-lg font-semibold">Eterna AI — Ownership Verification</div>
          </div>
        </div>
        <div className="p-8">
          {loading ? <div className="text-muted-foreground text-sm">Verifying…</div>
          : cert ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Valid certificate</span>
              </div>
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <dt className="text-muted-foreground">Certificate #</dt><dd className="col-span-2 font-mono">{cert.certificate_number}</dd>
                <dt className="text-muted-foreground">Owner</dt><dd className="col-span-2 font-medium">{cert.owner_name}</dd>
                <dt className="text-muted-foreground">Asset</dt><dd className="col-span-2">{cert.assets?.title} <span className="text-muted-foreground">({cert.assets?.asset_type})</span></dd>
                <dt className="text-muted-foreground">SHA-256</dt><dd className="col-span-2 font-mono text-xs break-all">{cert.assets?.sha256}</dd>
                <dt className="text-muted-foreground">Issued</dt><dd className="col-span-2">{new Date(cert.issued_at).toLocaleString()}</dd>
              </dl>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> <span className="font-semibold">Certificate not found</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
