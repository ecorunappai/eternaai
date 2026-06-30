
CREATE TABLE public.monitoring_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  creator_name TEXT NOT NULL,
  owner_name TEXT,
  brand_name TEXT,
  aliases TEXT[] DEFAULT '{}',
  regional_name TEXT,
  official_youtube_url TEXT,
  official_instagram_url TEXT,
  original_source_url TEXT,
  keywords TEXT[] DEFAULT '{}',
  platforms TEXT[] DEFAULT ARRAY['youtube'],
  scan_frequency TEXT DEFAULT 'daily',
  auto_scan BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active',
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_profiles TO authenticated;
GRANT ALL ON public.monitoring_profiles TO service_role;

ALTER TABLE public.monitoring_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own monitoring profiles"
  ON public.monitoring_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER monitoring_profiles_touch
  BEFORE UPDATE ON public.monitoring_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX monitoring_profiles_user_idx ON public.monitoring_profiles(user_id);
CREATE INDEX monitoring_profiles_asset_idx ON public.monitoring_profiles(asset_id);
