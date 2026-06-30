
CREATE TABLE public.scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'youtube',
  query text,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  total_passes int NOT NULL DEFAULT 0,
  passes_done int NOT NULL DEFAULT 0,
  current_pass text,
  candidates_found int NOT NULL DEFAULT 0,
  new_count int NOT NULL DEFAULT 0,
  duplicates_skipped int NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jobs TO authenticated;
GRANT ALL ON public.scan_jobs TO service_role;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own scan jobs" ON public.scan_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX scan_jobs_asset_idx ON public.scan_jobs(asset_id, started_at DESC);
CREATE INDEX scan_jobs_user_idx ON public.scan_jobs(user_id, started_at DESC);
CREATE TRIGGER scan_jobs_touch BEFORE UPDATE ON public.scan_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
