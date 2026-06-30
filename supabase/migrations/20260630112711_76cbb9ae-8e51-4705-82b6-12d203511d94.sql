
ALTER TABLE public.discovered_matches
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS recency_hours numeric,
  ADD COLUMN IF NOT EXISTS recency_label text,
  ADD COLUMN IF NOT EXISTS view_count bigint,
  ADD COLUMN IF NOT EXISTS trending_score numeric,
  ADD COLUMN IF NOT EXISTS content_tags text[];

CREATE INDEX IF NOT EXISTS idx_discovered_matches_published_at
  ON public.discovered_matches (user_id, asset_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_matches_trending
  ON public.discovered_matches (user_id, asset_id, trending_score DESC);
