import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, FileStack, Loader2, Trash2, ExternalLink, ScanSearch, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { hashImageFile, extractVideoKeyframes } from "@/lib/perceptual-hash";
import { setupAssetMonitoring } from "@/lib/monitoring-jobs.functions";

export const Route = createFileRoute("/registry")({
  head: () => ({ meta: [{ title: "Content Registry — Eterna AI" }] }),
  component: Registry,
});

const ISSUE_TYPES = [
  "Impersonation",
  "Content theft / reupload",
  "Troll / harassment",
  "Defamation",
  "Deepfake",
  "Trademark misuse",
];

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
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
        const path = `${user.id}/${Date.now()}-${safeName || "file"}`;
        const { error: upErr } = await supabase.storage.from("assets").upload(path, file);
        if (upErr) throw upErr;
        const type = detectType(file.type);
        let phash: string | null = null, dhash: string | null = null, ahash: string | null = null;
        let image_metadata: Record<string, string | number> | null = null;
        let keyframes: Awaited<ReturnType<typeof extractVideoKeyframes>> | null = null;
        try {
          if (type === "image") {
            const h = await hashImageFile(file);
            phash = h.phash; dhash = h.dhash; ahash = h.ahash;
            image_metadata = { width: h.width, height: h.height };
          } else if (type === "video") {
            keyframes = await extractVideoKeyframes(file);
            if (keyframes.hashes.length) {
              phash = keyframes.hashes[0].phash;
              dhash = keyframes.hashes[0].dhash;
              image_metadata = { width: keyframes.width, height: keyframes.height, duration: keyframes.duration, keyframes: keyframes.hashes.length };
            }
          }
        } catch (err) { console.warn("fingerprint", err); }

        const { data: inserted, error } = await supabase.from("assets").insert({
          user_id: user.id, title: file.name, asset_type: type,
          storage_path: path, file_size: file.size, mime_type: file.type, sha256: sha,
          phash, dhash, ahash, image_metadata,
        }).select("id").maybeSingle();
        if (error) throw error;

        if (keyframes && inserted) {
          await supabase.from("asset_keyframes").insert(keyframes.hashes.map((k) => ({
            asset_id: inserted.id, user_id: user.id,
            timestamp_sec: k.timestamp, phash: k.phash,
          })));
        }
      }
      toast.success(`${files.length} asset(s) fingerprinted (SHA-256 + perceptual hashes)`);
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
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link to="/matching" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mr-3"><ScanSearch className="h-3 w-3" />Scan</Link>
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
