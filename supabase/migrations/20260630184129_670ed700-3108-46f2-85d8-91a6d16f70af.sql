
CREATE TABLE public.monitoring_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.monitoring_profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'content_registry',
  asset_name TEXT NOT NULL,
  scan_type TEXT NOT NULL,
  worker_task_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL DEFAULT 'active',
  last_run_at TIMESTAMPTZ,
  last_task_id UUID,
  last_worker_task_id TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX monitoring_jobs_user_idx ON public.monitoring_jobs(user_id, created_at DESC);
CREATE INDEX monitoring_jobs_due_idx ON public.monitoring_jobs(status, next_run_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_jobs TO authenticated;
GRANT ALL ON public.monitoring_jobs TO service_role;

ALTER TABLE public.monitoring_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitoring_jobs_owner_all" ON public.monitoring_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER monitoring_jobs_touch_updated_at
  BEFORE UPDATE ON public.monitoring_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Allow registry flow to capture issue types and protection profile metadata
ALTER TABLE public.monitoring_profiles
  ADD COLUMN IF NOT EXISTS issue_types TEXT[] NOT NULL DEFAULT '{}'::text[];
