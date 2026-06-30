import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, Award, ScanSearch, Youtube, AlertOctagon, BadgeCheck, Phone, Gavel, Loader2, ExternalLink, Sparkles, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { runYouTubeScan } from "@/lib/youtube-matching.functions";

export const Route = createFileRoute("/asset/$id")({
  head: () => ({ meta: [{ title: "Asset — Eterna AI" }] }),
  component: AssetPage,
});

const TABS = [
  { id: "overview", label: "Overview", icon: ScanSearch },
  { id: "certificate", label: "Certificate", icon: Award },
  { id: "monitoring", label: "Monitoring", icon: ShieldCheck },
  { id: "youtube", label: "YouTube Matches", icon: Youtube },
  { id: "violations", label: "Suspected Violations", icon: AlertOctagon },
  { id: "official", label: "Official Content", icon: BadgeCheck },
  { id: "contacts", label: "Contact Discovery", icon: Phone },
  { id: "enforcement", label: "Enforcement", icon: Gavel },
] as const;

function AssetPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [asset, setAsset] = useState<any>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [cert, setCert] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [official, setOfficial] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [liveJob, setLiveJob] = useState<any>(null);
  const [tab, setTab] = useState<string>("overview");
  const [scanning, setScanning] = useState(false);
  const scanFn = useServerFn(runYouTubeScan);

  async function load() {
    if (!id) return;
    const { data: a } = await supabase.from("assets").select("*").eq("id", id).maybeSingle();
    setAsset(a);
    if (a?.storage_path) {
      const { data: signed } = await supabase.storage.from("assets").createSignedUrl(a.storage_path, 3600);
      setThumb(signed?.signedUrl ?? null);
    }
    const [p, c, m, v, o, ct, cs, sj] = await Promise.all([
      supabase.from("monitoring_profiles").select("*").eq("asset_id", id).maybeSingle(),
      supabase.from("certificates").select("*").eq("asset_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("discovered_matches").select("*").eq("asset_id", id).order("created_at", { ascending: false }).limit(500),
      supabase.from("violations").select("*").eq("asset_id", id).order("created_at", { ascending: false }),
      supabase.from("owned_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("creator_contacts").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("enforcement_cases").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("scan_jobs").select("*").eq("asset_id", id).order("started_at", { ascending: false }).limit(25),
    ]);
    setProfile(p.data); setCert(c.data); setMatches(m.data ?? []); setViolations(v.data ?? []);
    setOfficial(o.data ?? []); setContacts(ct.data ?? []); setCases(cs.data ?? []);
    setJobs(sj.data ?? []);
    const running = (sj.data ?? []).find((j: any) => j.status === "running");
    setLiveJob(running ?? null);
  }
  useEffect(() => { if (user && id) load(); }, [user, id]);

  const youtubeMatches = useMemo(() => matches.filter(m => m.discovered_via === "youtube_firecrawl_ai_verified"), [matches]);
  const officialMatches = useMemo(() => youtubeMatches.filter(m => m.is_owned || m.result_category === "official"), [youtubeMatches]);

  async function rescan() {
    if (!profile?.creator_name) return toast.error("Set up a monitoring profile first.");
    setScanning(true);
    try {
      const r: any = await scanFn({ data: { assetId: id, query: profile.creator_name } });
      await supabase.from("monitoring_profiles").update({ last_scan_at: new Date().toISOString() }).eq("id", profile.id);
      toast.success(`+${r.new_count ?? r.inserted ?? 0} new · total ${r.total ?? 0}`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setScanning(false); }
  }

  if (!asset) return <AppShell title="Asset"><div className="py-16 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div></AppShell>;

  return (
    <AppShell title={asset.title}>
      <div className="mb-4">
        <Link to="/registry" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Back to Registry</Link>
      </div>

      <div className="mb-6 flex items-start gap-4 flex-wrap">
        {thumb ? <img src={thumb} alt={asset.title} className="h-24 w-24 rounded-xl object-cover border border-border" /> :
          <div className="h-24 w-24 rounded-xl bg-muted grid place-items-center text-muted-foreground"><ScanSearch className="h-6 w-6" /></div>}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-semibold truncate">{asset.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary capitalize">{asset.asset_type}</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 border border-emerald-500/30 font-semibold">● {asset.status}</span>
            {profile && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-medium text-violet-600 border border-violet-500/30">Monitoring: {profile.creator_name}</span>}
            <span className="text-muted-foreground">Registered {new Date(asset.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile ? (
            <button onClick={rescan} disabled={scanning} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-violet)" }}>
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Run Scan Now
            </button>
          ) : (
            <Link to="/registry" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
              <ShieldCheck className="h-3.5 w-3.5" /> Setup Protection
            </Link>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon;
          const count = t.id === "youtube" ? youtubeMatches.length : t.id === "violations" ? violations.length : t.id === "official" ? officialMatches.length : t.id === "contacts" ? contacts.length : t.id === "enforcement" ? cases.length : 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}{count > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({count})</span>}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {tab === "overview" && <Overview asset={asset} profile={profile} matches={youtubeMatches} violations={violations} />}
        {tab === "certificate" && <CertView cert={cert} asset={asset} />}
        {tab === "monitoring" && <MonitoringView profile={profile} onEdit={() => nav({ to: "/registry" })} />}
        {tab === "youtube" && <MatchesList items={youtubeMatches} />}
        {tab === "violations" && <ViolationsList items={violations} />}
        {tab === "official" && <OfficialView matches={officialMatches} accounts={official} />}
        {tab === "contacts" && <ContactsList items={contacts} />}
        {tab === "enforcement" && <CasesList items={cases} />}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="rounded-lg border border-border bg-background p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>;
}

function Overview({ asset, profile, matches, violations }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="YouTube Matches" value={matches.length} />
        <Stat label="Suspected Violations" value={violations.length} />
        <Stat label="SHA-256" value={<span className="font-mono text-xs">{asset.sha256?.slice(0, 12)}…</span>} />
        <Stat label="Monitoring" value={profile ? "Active" : "Not set"} />
      </div>
      {!profile && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">No monitoring profile yet. Open Registry → Protect to set up automatic discovery.</div>}
    </div>
  );
}

function CertView({ cert, asset }: any) {
  if (!cert) return <Empty msg="No certificate issued. Issue one from the Registry." />;
  return (
    <div className="space-y-2 text-sm">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Certificate Number</div>
      <div className="font-mono text-base font-semibold">{cert.certificate_number}</div>
      <div className="text-muted-foreground">Owner: <span className="text-foreground">{cert.owner_name}</span></div>
      <div className="text-muted-foreground">Issued: {new Date(cert.created_at).toLocaleString()}</div>
      <Link to="/verify/$certId" params={{ certId: cert.certificate_number }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Public verify link</Link>
    </div>
  );
}

function MonitoringView({ profile, onEdit }: any) {
  if (!profile) return <Empty msg="No monitoring profile yet." />;
  const rows: [string, any][] = [
    ["Creator", profile.creator_name],
    ["Owner", profile.owner_name],
    ["Brand", profile.brand_name],
    ["Aliases", (profile.aliases ?? []).join(", ")],
    ["Regional name", profile.regional_name],
    ["Official YouTube", profile.official_youtube_url],
    ["Official Instagram", profile.official_instagram_url],
    ["Original source", profile.original_source_url],
    ["Keywords", (profile.keywords ?? []).join(", ")],
    ["Platforms", (profile.platforms ?? []).join(", ")],
    ["Scan frequency", profile.scan_frequency],
    ["Auto-scan", profile.auto_scan ? "Yes" : "No"],
    ["Status", profile.status],
    ["Last scan", profile.last_scan_at ? new Date(profile.last_scan_at).toLocaleString() : "Never"],
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Edit3 className="h-3 w-3" /> Edit profile</button></div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-background p-3">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-sm break-words">{v || <span className="text-muted-foreground">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MatchesList({ items }: { items: any[] }) {
  if (!items.length) return <Empty msg="No YouTube matches yet. Run a scan from the Overview tab." />;
  return (
    <ul className="space-y-2">
      {items.slice(0, 200).map(m => (
        <li key={m.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-2">
          <img src={m.preview_url} alt="" loading="lazy" className="h-16 w-28 rounded-md object-cover bg-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium line-clamp-2">{m.video_title}</div>
            <div className="text-xs text-muted-foreground">{m.channel_name} · {m.result_category}</div>
            <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Open</a>
          </div>
          <div className="text-right text-[11px]"><div className="font-semibold">{m.final_confidence_score ?? 0}%</div><div className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</div></div>
        </li>
      ))}
    </ul>
  );
}

function ViolationsList({ items }: { items: any[] }) {
  if (!items.length) return <Empty msg="No violations escalated for this asset." />;
  return <ul className="space-y-2">{items.map(v => (
    <li key={v.id} className="rounded-lg border border-border bg-background p-3 text-sm">
      <div className="font-medium">{v.platform} · <span className="text-muted-foreground">{v.status}</span></div>
      <a href={v.infringing_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{v.infringing_url}</a>
    </li>
  ))}</ul>;
}

function OfficialView({ matches, accounts }: any) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registered Official Accounts</div>
        {accounts.length === 0 ? <Empty msg="No official accounts registered. Go to Official Content." /> : (
          <ul className="space-y-1.5">{accounts.map((a: any) => (
            <li key={a.id} className="flex items-center gap-2 rounded border border-border bg-background p-2 text-xs">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium">{a.display_name}</span>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary hover:underline">{a.url}</a>
            </li>
          ))}</ul>
        )}
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Matched Official Videos</div>
        <MatchesList items={matches} />
      </div>
    </div>
  );
}

function ContactsList({ items }: { items: any[] }) {
  if (!items.length) return <Empty msg="No contacts discovered yet. Run the AI Browser Agent." />;
  return <ul className="space-y-1.5">{items.map(c => (
    <li key={c.id} className="rounded border border-border bg-background p-2 text-xs">
      <div className="font-medium">{c.name ?? c.email ?? "Contact"}</div>
      <div className="text-muted-foreground">{c.email} · {c.platform}</div>
    </li>
  ))}</ul>;
}

function CasesList({ items }: { items: any[] }) {
  if (!items.length) return <Empty msg="No enforcement cases for this asset yet." />;
  return <ul className="space-y-1.5">{items.map(c => (
    <li key={c.id} className="rounded border border-border bg-background p-2 text-xs">
      <div className="font-medium">{c.case_number ?? c.id.slice(0, 8)} · {c.status}</div>
      <div className="text-muted-foreground">{c.target_url}</div>
    </li>
  ))}</ul>;
}

function Empty({ msg }: { msg: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{msg}</div>;
}
