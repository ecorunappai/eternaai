-- Owned / official accounts a user has claimed
CREATE TABLE public.owned_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- youtube | instagram | facebook | x | tiktok | website
  display_name TEXT NOT NULL,
  handle TEXT,
  url TEXT NOT NULL,
  channel_id TEXT, -- YouTube channel ID (UC...) when known
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verification_source TEXT, -- youtube_badge | manual | website_link | wikipedia
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owned_accounts TO authenticated;
GRANT ALL ON public.owned_accounts TO service_role;
ALTER TABLE public.owned_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owned_accounts_owner" ON public.owned_accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX owned_accounts_user_idx ON public.owned_accounts(user_id, platform);

-- Library of the creator's own original videos (reference set)
CREATE TABLE public.original_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owned_account_id UUID REFERENCES public.owned_accounts(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  channel_name TEXT,
  upload_date TEXT,
  description TEXT,
  url TEXT NOT NULL,
  phash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.original_videos TO authenticated;
GRANT ALL ON public.original_videos TO service_role;
ALTER TABLE public.original_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "original_videos_owner" ON public.original_videos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX original_videos_user_idx ON public.original_videos(user_id);

-- Matched segments inside a suspected YouTube video
CREATE TABLE public.video_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.discovered_matches(id) ON DELETE CASCADE,
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  frame_count INTEGER NOT NULL DEFAULT 1,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  phash_score NUMERIC(5,2) DEFAULT 0,
  clip_score NUMERIC(5,2) DEFAULT 0,
  face_score NUMERIC(5,2) DEFAULT 0,
  ocr_score NUMERIC(5,2) DEFAULT 0,
  detection_method TEXT NOT NULL DEFAULT 'storyboard', -- storyboard | external_ffmpeg | manual
  match_type TEXT, -- reupload | trimmed_clip | face_in_video | thumbnail_reuse | meme_edit | reaction_insert
  frame_screenshot_url TEXT,
  deep_link TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_segments TO authenticated;
GRANT ALL ON public.video_segments TO service_role;
ALTER TABLE public.video_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "video_segments_owner" ON public.video_segments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX video_segments_match_idx ON public.video_segments(match_id);

-- Extend discovered_matches with classification and owned flag
ALTER TABLE public.discovered_matches
  ADD COLUMN IF NOT EXISTS result_category TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS is_owned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS segments_scanned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_video_id UUID REFERENCES public.original_videos(id) ON DELETE SET NULL;

-- Auto-update updated_at on owned_accounts / original_videos
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER owned_accounts_touch BEFORE UPDATE ON public.owned_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER original_videos_touch BEFORE UPDATE ON public.original_videos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();