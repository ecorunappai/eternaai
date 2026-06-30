CREATE TABLE public.youtube_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_account_id text,
  youtube_channel_id text,
  youtube_channel_title text,
  email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text,
  status text NOT NULL DEFAULT 'connected',
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.youtube_connections TO authenticated;
GRANT ALL ON public.youtube_connections TO service_role;

ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own youtube connection"
  ON public.youtube_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_youtube_connections
  BEFORE UPDATE ON public.youtube_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Track YouTube report submissions per takedown case
ALTER TABLE public.takedown_cases
  ADD COLUMN IF NOT EXISTS youtube_report_status text,
  ADD COLUMN IF NOT EXISTS youtube_report_prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS youtube_report_payload jsonb;