import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Award, ExternalLink, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/certificates")({
  head: () => ({ meta: [{ title: "Certificates — Eterna AI" }] }),
  component: Certificates,
});

function Certificates() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from("certificates").select("*, assets(title, asset_type, sha256)").order("issued_at", { ascending: false });
    setRows(data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function remove(id: string) {
    if (!confirm("Revoke this certificate?")) return;
    await supabase.from("certificates").delete().eq("id", id); toast.success("Revoked"); load();
  }

  return (
    <AppShell title="Certificates">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Ownership Certificates</h1>
        <p className="text-sm text-muted-foreground">Public, verifiable proof of registration. Issue certificates from the <a className="text-primary underline" href="/registry">Registry</a>.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => {
          const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${c.certificate_number}`;
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-5 text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
                <div className="flex items-center gap-2"><Award className="h-4 w-4" /><span className="text-xs uppercase tracking-widest opacity-80">Eterna AI Certificate</span></div>
                <div className="mt-2 font-mono text-sm">{c.certificate_number}</div>
              </div>
              <div className="p-5 flex gap-4">
                <div className="rounded-lg border border-border bg-white p-2"><QRCodeSVG value={verifyUrl} size={88} /></div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-display font-semibold truncate">{c.assets?.title}</div>
                  <div className="text-xs text-muted-foreground capitalize">{c.assets?.asset_type} · {c.owner_name}</div>
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground break-all">{c.assets?.sha256?.slice(0, 32)}…</div>
                  <div className="mt-2 text-xs text-muted-foreground">{new Date(c.issued_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs">
                <a href={verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary font-medium hover:underline"><ExternalLink className="h-3 w-3" />Public verify</a>
                <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-border bg-card p-12 text-center">
            <Award className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No certificates yet</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
