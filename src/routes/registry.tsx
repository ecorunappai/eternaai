import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Upload, FileStack, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/registry")({
  head: () => ({ meta: [{ title: "Content Registry — Eterna AI" }] }),
  component: Registry,
});

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function detectType(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function Registry() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("assets").select("*").order("created_at", { ascending: false });
    setAssets(data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user) return;
    setUploading(true);
    try {
      for (const file of files) {
        const sha = await sha256Hex(file);
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("assets").upload(path, file);
        if (upErr) throw upErr;
        const { error } = await supabase.from("assets").insert({
          user_id: user.id, title: file.name, asset_type: detectType(file.type),
          storage_path: path, file_size: file.size, mime_type: file.type, sha256: sha,
        });
        if (error) throw error;
      }
      toast.success(`${files.length} asset(s) registered with SHA-256 fingerprint`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function remove(a: any) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    if (a.storage_path) await supabase.storage.from("assets").remove([a.storage_path]);
    await supabase.from("assets").delete().eq("id", a.id);
    toast.success("Removed");
    load();
  }

  async function issueCert(a: any) {
    if (!user) return;
    const certNum = `ETN-${new Date().getFullYear()}-${a.id.slice(0, 8).toUpperCase()}`;
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const { error } = await supabase.from("certificates").insert({
      asset_id: a.id, user_id: user.id, certificate_number: certNum,
      owner_name: prof?.full_name ?? user.email ?? "Owner",
    });
    if (error) toast.error(error.message); else toast.success(`Certificate ${certNum} issued`);
  }

  return (
    <AppShell title="Content Registry">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Content Registry</h1>
          <p className="text-sm text-muted-foreground">Upload assets to generate SHA-256 fingerprints and enable monitoring.</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Register Content
        </button>
        <input ref={fileRef} type="file" multiple onChange={onUpload} className="hidden" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {assets.length === 0 ? (
          <div className="py-16 text-center">
            <FileStack className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 font-medium">No assets registered yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Upload images, video, audio or documents to begin protecting them.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-3">Title</th><th className="text-left p-3">Type</th><th className="text-left p-3">SHA-256</th><th className="text-left p-3">Status</th><th className="text-left p-3">Registered</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-accent/30">
                  <td className="p-3 font-medium">{a.title}</td>
                  <td className="p-3"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary capitalize">{a.asset_type}</span></td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{a.sha256?.slice(0, 16)}…</td>
                  <td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">● {a.status}</span></td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => issueCert(a)} className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mr-3"><ExternalLink className="h-3 w-3" />Issue cert</button>
                    <button onClick={() => remove(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
