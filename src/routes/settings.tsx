import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Eterna AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [full_name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      setName(data?.full_name ?? ""); setCompany(data?.company ?? "");
    });
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name, company });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  }

  return (
    <AppShell title="Settings">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and workspace.</p>
      </div>

      <form onSubmit={save} className="max-w-xl rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Full name</label>
          <input value={full_name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Company / brand</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Email</label>
          <input disabled value={user?.email ?? ""} className="mt-1 w-full h-10 rounded-lg border border-input bg-muted px-3 text-sm" />
        </div>
        <button disabled={busy} className="h-10 rounded-lg px-4 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </AppShell>
  );
}
