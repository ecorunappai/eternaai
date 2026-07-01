// Bright Data — Google Lens reverse image search.
// Server-only helper. Uses the SERP API zone; caller must set BRIGHTDATA_API_TOKEN.
import { brightdataConfig } from "./brightdata.functions";

const BRIGHTDATA_URL = "https://api.brightdata.com/request";

export type LensCandidate = {
  url: string;
  host: string;
  rank: number;
  thumb: string | null;
  title?: string;
};

const EXCLUDED_HOSTS = [
  "google.com", "google.", "gstatic.com", "googleusercontent.com",
  "googleapis.com", "schema.org", "w3.org",
  "lens.google.com", "localhost", "lovable.app",
];

function isExcluded(host: string) {
  return EXCLUDED_HOSTS.some((h) => host.includes(h));
}

/**
 * Query Bright Data's SERP zone with a Google Lens "search by image URL" request.
 * Returns normalized candidate rows ready for AI verification.
 */
export async function brightdataRunLensReverse(imageUrl: string): Promise<LensCandidate[]> {
  const { token, serpZone } = brightdataConfig();
  if (!token) throw new Error("BRIGHTDATA_API_TOKEN not configured");

  // Google Lens accepts a public image URL via uploadbyurl. brd_json=1 asks
  // Bright Data's SERP parser to return structured JSON.
  const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}&brd_json=1`;

  const res = await fetch(BRIGHTDATA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone: serpZone, url: lensUrl, format: "raw" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bright Data ${res.status}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();

  // Try JSON first (brd_json), fall back to visual_matches array shape.
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  const raw: any[] = parsed?.visual_matches
    ?? parsed?.related_images
    ?? parsed?.matches
    ?? parsed?.organic
    ?? [];

  const seen = new Set<string>();
  const out: LensCandidate[] = [];
  raw.forEach((r, idx) => {
    const url: string = r.link ?? r.url ?? r.source ?? "";
    if (!url) return;
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return; }
    if (isExcluded(host)) return;
    const key = url.split("?")[0];
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      url,
      host,
      rank: idx,
      thumb: r.thumbnail ?? r.image ?? r.image_url ?? null,
      title: r.title ?? r.source_name ?? undefined,
    });
  });
  return out;
}
