import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Upload, FileStack, Loader2, Trash2, ExternalLink, ScanSearch, ShieldCheck, X, Sparkles, Youtube, Instagram, Tag, Globe } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { hashImageFile, extractVideoKeyframes } from "@/lib/perceptual-hash";
import { runYouTubeScan } from "@/lib/youtube-matching.functions";
import { runWebScanEverywhere } from "@/lib/web-scan.functions";

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

const AUTO_SCAN_KEY = "eterna.autoScanAfterUpload";

function Registry() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [assets, setAssets] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [setupAsset, setSetupAsset] = useState<any | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [autoScanDefault, setAutoScanDefault] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(AUTO_SCAN_KEY) !== "0";
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const webScanFn = useServerFn(runWebScanEverywhere);
  const ytScanFn = useServerFn(runYouTubeScan);

  async function load() {
    const { data } = await supabase.from("assets").select("*").order("created_at", { ascending: false });
    setAssets(data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function searchEverywhere(a: any) {
    setScanningId(a.id);
    toast.message(`Searching all sites for "${a.title}"…`);
    try {
      // Get creator name from monitoring profile if available, else fallback to asset title
      const { data: prof } = await supabase.from("monitoring_profiles")
        .select("creator_name").eq("asset_id", a.id).maybeSingle();
      const query = (prof?.creator_name ?? a.title ?? "").trim();
      if (!query) {
        toast.error("Set up a monitoring profile (creator/brand name) first.");
        setSetupAsset(a);
        return;
      }
      // Run web + YouTube scans in parallel
      const [web, yt] = await Promise.allSettled([
        webScanFn({ data: { assetId: a.id, query } }),
        ytScanFn({ data: { assetId: a.id, query } }),
      ]);
      const webNew = web.status === "fulfilled" ? ((web.value as any).new_count ?? 0) : 0;
      const ytNew = yt.status === "fulfilled" ? ((yt.value as any).new_count ?? (yt.value as any).inserted ?? 0) : 0;
      const webTotal = web.status === "fulfilled" ? ((web.value as any).total ?? 0) : 0;
      toast.success(`Found ${webNew + ytNew} new results · Web: ${webTotal}, YouTube scan ran.`);
      if (web.status === "rejected") toast.error("Web scan: " + (web.reason as Error).message);
      if (yt.status === "rejected") toast.error("YouTube scan: " + (yt.reason as Error).message);
    } catch (e) { toast.error((e as Error).message); }
    finally { setScanningId(null); }
  }


  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user) return;
    setUploading(true);
    let lastInsertedId: string | null = null;
    let lastTitle = "";
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
        }).select("id,title,asset_type").maybeSingle();
        if (error) throw error;

        if (keyframes && inserted) {
          await supabase.from("asset_keyframes").insert(keyframes.hashes.map((k) => ({
            asset_id: inserted.id, user_id: user.id,
            timestamp_sec: k.timestamp, phash: k.phash,
          })));
        }
        if (inserted) { lastInsertedId = inserted.id; lastTitle = inserted.title; }
      }
      toast.success(`${files.length} asset(s) registered. Now set up monitoring.`);
      load();
      if (lastInsertedId) setSetupAsset({ id: lastInsertedId, title: lastTitle });
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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold">Content Registry</h1>
          <p className="text-sm text-muted-foreground">Upload assets → fingerprint → set up automatic monitoring across YouTube and the web.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoScanDefault} onChange={(e) => {
              setAutoScanDefault(e.target.checked);
              localStorage.setItem(AUTO_SCAN_KEY, e.target.checked ? "1" : "0");
            }} className="h-3.5 w-3.5 accent-primary" />
            Auto-start monitoring after every upload
          </label>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Register Content
          </button>
          <input ref={fileRef} type="file" multiple onChange={onUpload} className="hidden" />
        </div>
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
                  <td className="p-3 font-medium">
                    <Link to="/asset/$id" params={{ id: a.id }} className="hover:underline">{a.title}</Link>
                  </td>
                  <td className="p-3"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary capitalize">{a.asset_type}</span></td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{a.sha256?.slice(0, 16)}…</td>
                  <td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">● {a.status}</span></td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => setSetupAsset(a)} className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mr-3"><ShieldCheck className="h-3 w-3" />Protect</button>
                    <Link to="/asset/$id" params={{ id: a.id }} className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mr-3"><ScanSearch className="h-3 w-3" />Open</Link>
                    <button onClick={() => issueCert(a)} className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mr-3"><ExternalLink className="h-3 w-3" />Cert</button>
                    <button onClick={() => remove(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {setupAsset && (
        <ProtectionSetupDialog
          asset={setupAsset}
          autoScanDefault={autoScanDefault}
          onClose={() => setSetupAsset(null)}
          onDone={(profileId, openYoutube) => {
            setSetupAsset(null);
            if (openYoutube) nav({ to: "/youtube" });
          }}
        />
      )}
    </AppShell>
  );
}

function ProtectionSetupDialog({ asset, autoScanDefault, onClose, onDone }: {
  asset: { id: string; title: string };
  autoScanDefault: boolean;
  onClose: () => void;
  onDone: (profileId: string, openYoutube: boolean) => void;
}) {
  const { user } = useAuth();
  const [creator, setCreator] = useState("");
  const [owner, setOwner] = useState("");
  const [brand, setBrand] = useState("");
  const [aliases, setAliases] = useState("");
  const [regional, setRegional] = useState("");
  const [yt, setYt] = useState("");
  const [ig, setIg] = useState("");
  const [src, setSrc] = useState("");
  const [keywords, setKeywords] = useState("reaction, troll, issue, controversy, exposed, viral, news, shorts, fan edit, repost, latest");
  const [freq, setFreq] = useState("daily");
  const [autoScan, setAutoScan] = useState(autoScanDefault);
  const [saving, setSaving] = useState(false);
  const scanFn = useServerFn(runYouTubeScan);

  // Try to load existing profile for this asset to prefill
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("monitoring_profiles").select("*").eq("asset_id", asset.id).maybeSingle();
      if (data) {
        setCreator(data.creator_name ?? "");
        setOwner(data.owner_name ?? "");
        setBrand(data.brand_name ?? "");
        setAliases((data.aliases ?? []).join(", "));
        setRegional(data.regional_name ?? "");
        setYt(data.official_youtube_url ?? "");
        setIg(data.official_instagram_url ?? "");
        setSrc(data.original_source_url ?? "");
        setKeywords((data.keywords ?? []).join(", "));
        setFreq(data.scan_frequency ?? "daily");
        setAutoScan(data.auto_scan ?? true);
      }
    })();
  }, [asset.id]);

  async function save(thenScan: boolean) {
    if (!user) return;
    if (!creator.trim()) return toast.error("Creator / brand / person name is required.");
    setSaving(true);
    try {
      const aliasArr = aliases.split(",").map(s => s.trim()).filter(Boolean);
      const kwArr = keywords.split(",").map(s => s.trim()).filter(Boolean);
      const payload = {
        user_id: user.id,
        asset_id: asset.id,
        creator_name: creator.trim(),
        owner_name: owner.trim() || null,
        brand_name: brand.trim() || null,
        aliases: aliasArr,
        regional_name: regional.trim() || null,
        official_youtube_url: yt.trim() || null,
        official_instagram_url: ig.trim() || null,
        original_source_url: src.trim() || null,
        keywords: kwArr,
        platforms: ["youtube"],
        scan_frequency: freq,
        auto_scan: autoScan,
        status: "active",
      };
      const { data: existing } = await supabase.from("monitoring_profiles").select("id").eq("asset_id", asset.id).maybeSingle();
      let profileId: string;
      if (existing) {
        await supabase.from("monitoring_profiles").update(payload).eq("id", existing.id);
        profileId = existing.id;
      } else {
        const { data: ins, error } = await supabase.from("monitoring_profiles").insert(payload).select("id").maybeSingle();
        if (error) throw error;
        profileId = ins!.id;
      }
      toast.success("Monitoring profile saved");

      if (thenScan && autoScan) {
        toast.message("Starting automatic YouTube scan…");
        try {
          const r: any = await scanFn({ data: { assetId: asset.id, query: creator.trim() } });
          await supabase.from("monitoring_profiles").update({ last_scan_at: new Date().toISOString() }).eq("id", profileId);
          toast.success(`+${r.new_count ?? r.inserted ?? 0} new · ${r.passes_run ?? 0} passes · total ${r.total ?? 0}.`);
        } catch (e) { toast.error("Auto-scan failed: " + (e as Error).message); }
      }
      onDone(profileId, thenScan);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
              <ShieldCheck className="h-4 w-4" /> CONTENT REGISTERED SUCCESSFULLY
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold">Start Protection Setup</h2>
            <p className="text-xs text-muted-foreground">Tell Eterna AI who to monitor for <span className="font-medium text-foreground">{asset.title}</span>. We'll automatically search YouTube and other sources.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5">
          <Field label="Creator / Brand / Person Name *" value={creator} onChange={setCreator} placeholder="e.g. Ahaana Krishna" full />
          <Field label="Owner Name" value={owner} onChange={setOwner} placeholder="Legal owner" />
          <Field label="Brand Name" value={brand} onChange={setBrand} placeholder="Optional" />
          <Field label="Known Aliases (comma separated)" value={aliases} onChange={setAliases} placeholder="Ahaana, അഹാന" full />
          <Field label="Malayalam / Regional Name" value={regional} onChange={setRegional} placeholder="അഹാന കൃഷ്ണ" full />
          <Field label="Official YouTube Channel URL" value={yt} onChange={setYt} placeholder="https://youtube.com/@..." icon={Youtube} full />
          <Field label="Official Instagram URL" value={ig} onChange={setIg} placeholder="https://instagram.com/..." icon={Instagram} full />
          <Field label="Original Source URL" value={src} onChange={setSrc} placeholder="https://..." full />
          <Field label="Search Keywords (comma separated)" value={keywords} onChange={setKeywords} placeholder="reaction, troll, ..." icon={Tag} full />
          <label className="block">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Monitoring Frequency</div>
            <select value={freq} onChange={(e) => setFreq(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="realtime">Realtime</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={autoScan} onChange={(e) => setAutoScan(e.target.checked)} className="h-4 w-4 accent-primary" />
            Monitoring enabled (auto-scan now)
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 p-4">
          <button onClick={onClose} disabled={saving} className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">Skip for now</button>
          <button onClick={() => save(false)} disabled={saving} className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">Save profile</button>
          <button onClick={() => save(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Start Automatic Monitoring
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, full, icon: Icon }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; full?: boolean; icon?: any }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}{label}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
    </label>
  );
}
