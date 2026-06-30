// Browser-side perceptual hashing utilities (pHash / dHash / aHash)
// All return 64-bit hashes as 16-char hex strings.

function toGrayscale(ctx: CanvasRenderingContext2D, w: number, h: number): number[][] {
  const { data } = ctx.getImageData(0, 0, w, h);
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    out.push(row);
  }
  return out;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const n = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += n.toString(16);
  }
  return hex;
}

function drawToCanvas(img: HTMLImageElement | HTMLVideoElement, size: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  return ctx;
}

export function aHash(img: HTMLImageElement | HTMLVideoElement): string {
  const ctx = drawToCanvas(img, 8);
  const g = toGrayscale(ctx, 8, 8);
  const flat = g.flat();
  const avg = flat.reduce((a, b) => a + b, 0) / flat.length;
  return bitsToHex(flat.map((v) => (v >= avg ? 1 : 0)));
}

export function dHash(img: HTMLImageElement | HTMLVideoElement): string {
  const ctx = drawToCanvas(img, 9);
  const g = toGrayscale(ctx, 9, 9);
  const bits: number[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) bits.push(g[y][x + 1] > g[y][x] ? 1 : 0);
  return bitsToHex(bits);
}

// Simplified pHash: 32x32 grayscale -> naive DCT -> 8x8 low-freq -> median threshold
function dct1d(v: number[]): number[] {
  const N = v.length;
  const out = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let n = 0; n < N; n++) s += v[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    out[k] = s;
  }
  return out;
}

export function pHash(img: HTMLImageElement | HTMLVideoElement): string {
  const ctx = drawToCanvas(img, 32);
  const g = toGrayscale(ctx, 32, 32);
  const rows = g.map(dct1d);
  const cols: number[][] = [];
  for (let x = 0; x < 32; x++) {
    const col = new Array(32);
    for (let y = 0; y < 32; y++) col[y] = rows[y][x];
    cols.push(dct1d(col));
  }
  const lows: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) lows.push(cols[x][y]);
  const sorted = [...lows].slice(1).sort((a, b) => a - b); // drop DC
  const med = sorted[Math.floor(sorted.length / 2)];
  return bitsToHex(lows.map((v) => (v > med ? 1 : 0)));
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// 0..1 similarity from 64-bit hashes
export function hashSimilarity(a: string, b: string): number {
  return Math.max(0, 1 - hammingHex(a, b) / 64);
}

export async function loadImage(src: string | File): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

export interface AssetHashes {
  phash: string;
  dhash: string;
  ahash: string;
  width: number;
  height: number;
}

export async function hashImageFile(file: File): Promise<AssetHashes> {
  const img = await loadImage(file);
  return { phash: pHash(img), dhash: dHash(img), ahash: aHash(img), width: img.naturalWidth, height: img.naturalHeight };
}

export interface KeyframeHash { timestamp: number; phash: string; dhash: string; }

export async function extractVideoKeyframes(file: File, everySec = 4): Promise<{ hashes: KeyframeHash[]; duration: number; width: number; height: number }> {
  const video = document.createElement("video");
  video.preload = "auto"; video.muted = true; video.playsInline = true;
  video.src = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Failed to load video"));
  });
  const duration = video.duration || 0;
  const frames: KeyframeHash[] = [];
  for (let t = 0; t < duration; t += everySec) {
    await new Promise<void>((res) => { video.onseeked = () => res(); video.currentTime = t; });
    frames.push({ timestamp: t, phash: pHash(video), dhash: dHash(video) });
    if (frames.length >= 12) break; // cap for browser performance
  }
  return { hashes: frames, duration, width: video.videoWidth, height: video.videoHeight };
}
