
-- Extend assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS dhash text,
  ADD COLUMN IF NOT EXISTS ahash text,
  ADD COLUMN IF NOT EXISTS clip_embedding jsonb,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS image_metadata jsonb;

-- Keyframes
CREATE TABLE IF NOT EXISTS public.asset_keyframes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  frame_url text,
  timestamp_sec numeric,
  phash text,
  clip_embedding jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_keyframes TO authenticated;
GRANT ALL ON public.asset_keyframes TO service_role;
ALTER TABLE public.asset_keyframes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage keyframes" ON public.asset_keyframes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Discovered matches
CREATE TABLE IF NOT EXISTS public.discovered_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source_url text NOT NULL,
  platform text,
  domain text,
  preview_url text,
  discovered_phash text,
  phash_score numeric DEFAULT 0,
  dhash_score numeric DEFAULT 0,
  clip_score numeric DEFAULT 0,
  metadata_score numeric DEFAULT 0,
  ai_score numeric DEFAULT 0,
  final_confidence_score numeric DEFAULT 0,
  risk_level text DEFAULT 'review',
  match_type text DEFAULT 'unknown',
  status text DEFAULT 'pending',
  notes text,
  discovered_via text DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovered_matches TO authenticated;
GRANT ALL ON public.discovered_matches TO service_role;
ALTER TABLE public.discovered_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage discovered" ON public.discovered_matches
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS discovered_matches_asset_idx ON public.discovered_matches(asset_id);
CREATE INDEX IF NOT EXISTS discovered_matches_user_idx ON public.discovered_matches(user_id);

-- Extend violations with match linkage
ALTER TABLE public.violations
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.discovered_matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS violation_type text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric;
