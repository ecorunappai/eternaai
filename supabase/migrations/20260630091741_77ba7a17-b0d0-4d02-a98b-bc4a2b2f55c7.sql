ALTER TABLE public.discovered_matches
  ADD COLUMN IF NOT EXISTS channel_name TEXT,
  ADD COLUMN IF NOT EXISTS video_title TEXT,
  ADD COLUMN IF NOT EXISTS video_id TEXT,
  ADD COLUMN IF NOT EXISTS fair_use_flag TEXT,
  ADD COLUMN IF NOT EXISTS violation_category TEXT;