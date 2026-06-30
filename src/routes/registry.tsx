import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { FileStack, Image as ImageIcon, Music, Video, FileText, Upload, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/registry")({
  head: () => ({ meta: [{ title: "Content Registry — Eterna AI" }, { name: "description", content: "Register photos, videos, music and documents to generate immutable ownership records." }] }),
  component: Registry,
});

const assets = [
  { name: "Brand Launch Reel.mp4", type: "Video", size: "184 MB", hash: "0xc4f2…91ab", date: "Nov 28, 2024", icon: Video },
  { name: "Editorial Portrait #214", type: "Photo", size: "12.4 MB", hash: "0x8de1…a204", date: "Nov 27, 2024", icon: ImageIcon },
  { name: "Podcast Ep. 14 — Master", type: "Audio", size: "96.2 MB", hash: "0x71fa…be03", date: "Nov 25, 2024", icon: Music },
  { name: "Whitepaper — Q4 Strategy", type: "Document", size: "3.1 MB", hash: "0x2a90…77cd", date: "Nov 22, 2024", icon: FileText },
  { name: "Logo Mark Vector Set", type: "Design", size: "1.8 MB", hash: "0x55b1…0c22", date: "Nov 19, 2024", icon: ImageIcon },
];

function Registry() {
  return (
    <AppShell breadcrumb="Content Registry">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Content Registry</h1>
          <p className="text-sm text-muted-foreground">Upload assets to generate fingerprints, pHashes and ownership certificates.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-violet)" }}>
          <Upload className="h-4 w-4" /> Register new asset
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total assets", value: "2,847", icon: FileStack },
          { label: "Photos", value: "1,612", icon: ImageIcon },
          { label: "Videos & reels", value: "734", icon: Video },
          { label: "Audio & docs", value: "501", icon: Music },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5">
            <s.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 font-display text-2xl font-semibold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 surface-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h3 className="font-display text-lg font-semibold">Registered assets</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3 font-semibold">Asset</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3 font-semibold">Fingerprint</th>
              <th className="px-4 py-3 font-semibold">Registered</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.name} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-primary">
                      <a.icon className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{a.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs"><span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">{a.type}</span></td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">{a.size}</td>
                <td className="px-4 py-3.5 font-mono text-xs">{a.hash}</td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">{a.date}</td>
                <td className="px-6 py-3.5 text-right">
                  <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"><MoreHorizontal className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
