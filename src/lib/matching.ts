// Match scoring combiner — pure functions usable on client or server.
import { hashSimilarity } from "./perceptual-hash";

export interface ScoreInput {
  originalPhash?: string | null;
  originalDhash?: string | null;
  discoveredPhash?: string | null;
  discoveredDhash?: string | null;
  clipSimilarity?: number; // 0..1
  metadataSimilarity?: number; // 0..1
  aiSimilarity?: number; // 0..1
}

export interface ScoreResult {
  phash_score: number;
  dhash_score: number;
  clip_score: number;
  metadata_score: number;
  ai_score: number;
  final_confidence_score: number;
  risk_level: "confirmed" | "strong" | "possible" | "review";
  match_type: string;
}

export function computeScores(input: ScoreInput): ScoreResult {
  const phash = input.originalPhash && input.discoveredPhash ? hashSimilarity(input.originalPhash, input.discoveredPhash) : 0;
  const dhash = input.originalDhash && input.discoveredDhash ? hashSimilarity(input.originalDhash, input.discoveredDhash) : 0;
  const clip = input.clipSimilarity ?? 0;
  const meta = input.metadataSimilarity ?? 0;
  const ai = input.aiSimilarity ?? 0;

  const final = Math.round((phash * 40 + dhash * 15 + clip * 25 + meta * 10 + ai * 10));
  const risk: ScoreResult["risk_level"] =
    final >= 90 ? "confirmed" : final >= 75 ? "strong" : final >= 60 ? "possible" : "review";

  let type = "unknown";
  if (phash >= 0.95) type = "exact_repost";
  else if (phash >= 0.85) type = "resized_or_recompressed";
  else if (dhash >= 0.8 && phash < 0.85) type = "cropped_or_edited";
  else if (clip >= 0.85) type = "visually_similar";
  else if (final >= 60) type = "possible_derivative";

  return {
    phash_score: +(phash * 100).toFixed(1),
    dhash_score: +(dhash * 100).toFixed(1),
    clip_score: +(clip * 100).toFixed(1),
    metadata_score: +(meta * 100).toFixed(1),
    ai_score: +(ai * 100).toFixed(1),
    final_confidence_score: final,
    risk_level: risk,
    match_type: type,
  };
}

export function riskBadge(level: string) {
  switch (level) {
    case "confirmed": return { label: "Confirmed Match", className: "bg-destructive/10 text-destructive border-destructive/30" };
    case "strong": return { label: "Strong Match", className: "bg-orange-500/10 text-orange-600 border-orange-500/30" };
    case "possible": return { label: "Possible Match", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
    default: return { label: "Needs Review", className: "bg-muted text-muted-foreground border-border" };
  }
}
