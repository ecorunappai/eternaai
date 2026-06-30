import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Plus, Trash2, RefreshCw, Loader2, BadgeCheck, Youtube, Instagram, Facebook, Twitter, Globe, Sparkles, FileVideo, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { addOwnedAccount, removeOwnedAccount, syncOriginalVideos, autodetectOfficialAccounts, classifyMatches } from "@/lib/owned-content.functions";

export const Route = createFileRoute("/owned")({
  head: () => ({ meta: [{ title: "Official / Owned Content — Eterna AI" }] }),
  component: OwnedPage,
});

const PLATFORM_ICON: Record<string, any> = {
  youtube: Youtube, instagram: Instagram, facebook: Facebook,
  x: Twitter, tiktok: Sparkles, website: Globe,
};

function OwnedPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [detectName, setDetectName] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const [platform, setPlatform] = useState("youtube");
  const [displayName, setDisplayName] = useState("");
  const [url, setUrl] = useState("");
  const [handle, setHandle] = useState("");

  const addFn = useServerFn(addOwnedAccount);
  const rmFn = useServerFn(removeOwnedAccount);
  const syncFn = useServerFn(syncOriginalVideos);
  const detectFn = useServerFn(autodetectOfficialAccounts);
  const classifyFn = useServerFn(classifyMatches);

  async function load() {
    const [a, v] = await Promise.all([
      supabase.from("owned_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("original_videos").select("*").order("created_at", { ascending: false }).limit(60),
    ]);
    setAccounts(a.data ?? []);
    setVideos(v.data ?? []);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || !url) return toast.error("Display name and URL are required.");
    setBusy(true);
    try {
      await addFn({ data: { platform: platform as any, display_name: displayName, url, handle: handle || null, notes: null } });
      toast.success("Official account added");
      setDisplayName(""); setUrl(""); setHandle("");
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onAutoDetect() {
    if (!detectName.trim()) return;
    setBusy(true);
    try {
      const r = await detectFn({ data: { name: detectName.trim() } });
      setSuggestions(r.candidates ?? []);
      toast.success(`${(r.candidates ?? []).length} suggestions`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function acceptSuggestion(s: any) {
    try {
      await addFn({ data: { platform: s.platform, display_name: s.display_name, url: s.url, handle: s.handle ?? null, notes: null } });
      toast.success(`Added ${s.platform} account`);
      setSuggestions(suggestions.filter(x => x.url !== s.url));
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function onSync(id: string) {
    setSyncingId(id);
    try {
      const r = await syncFn({ data: { owned_account_id: id } });
      toast.success(`${r.inserted ?? 0} original videos imported`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncingId(null); }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this official account?")) return;
    try { await rmFn({ data: { id } }); toast.success("Removed"); load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function onReclassify() {
    setBusy(true);
    try {
      const r = await classifyFn({ data: {} });
      toast.success(`${r.classified} of ${r.total} discovered videos re-classified`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <AppShell title="Official Content">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Official / Owned Content</h1>
          <p className="text-sm text-muted-foreground">Register the creator's verified channels and profiles. Owned accounts are <span className="font-semibold text-emerald-600">never</span> flagged as infringers. Original videos from official YouTube channels become the reference library for detecting reposts and reactions.</p>
        </div>
        <button onClick={onReclassify} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-accent disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Re-classify all matches
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <form onSubmit={onAdd} className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Add official account</h2></div>
          <div className="grid grid-cols-2 gap-2">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option>
              <option value="x">X / Twitter</option><option value="tiktok">TikTok</option><option value="website">Website</option>
            </select>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle (optional)" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          </div>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (e.g. Ahaana Krishna Official)" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/@ahaanakrishna" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add account
          </button>
        </form>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Auto-detect from name</h2></div>
          <div className="flex gap-2">
            <input value={detectName} onChange={(e) => setDetectName(e.target.value)} placeholder="Creator / brand name" className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
            <button onClick={onAutoDetect} disabled={busy || !detectName} className="inline-flex h-10 items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Detect
            </button>
          </div>
          {suggestions.length === 0 ? <p className="text-xs text-muted-foreground">Discovers YouTube channels (with verified badge), plus IG / X / Facebook / TikTok via search. Review each before adding.</p> : (
            <ul className="space-y-1.5 max-h-64 overflow-auto">
              {suggestions.map((s, i) => {
                const Icon = PLATFORM_ICON[s.platform] ?? Globe;
                return (
                  <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium capitalize">{s.platform}</span>
                    {s.verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                    <span className="truncate flex-1 text-muted-foreground">{s.url}</span>
                    <button onClick={() => acceptSuggestion(s)} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20">Add</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-4 text-sm font-semibold">Owned accounts ({accounts.length})</div>
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
        {accounts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No official accounts yet. Add one above to mark it safe.</div>
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((a) => {
              const Icon = PLATFORM_ICON[a.platform] ?? Globe;
              return (
                <li key={a.id} className="flex items-center gap-3 p-4">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{a.display_name}</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-500/30">Owned · Safe</span>
                      {a.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.platform}</span>
                    </div>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" />{a.url}</a>
                  </div>
                  {a.platform === "youtube" && (
                    <button onClick={() => onSync(a.id)} disabled={syncingId === a.id} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-accent disabled:opacity-50">
                      {syncingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileVideo className="h-3 w-3" />} Sync videos
                    </button>
                  )}
                  <button onClick={() => onRemove(a.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mb-4 text-sm font-semibold">Original content library ({videos.length})</div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {videos.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No original videos imported yet. Use "Sync videos" on a YouTube account above.</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
            {videos.map((v) => (
              <li key={v.id} className="rounded-lg border border-border bg-background overflow-hidden">
                <a href={v.url} target="_blank" rel="noopener noreferrer">
                  <img src={v.thumbnail_url} alt={v.title} className="aspect-video w-full object-cover" loading="lazy" />
                </a>
                <div className="p-2.5">
                  <div className="text-xs font-medium line-clamp-2">{v.title}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 border border-emerald-500/30">Original</span>
                    <span className="text-[10px] text-muted-foreground truncate">{v.channel_name}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
