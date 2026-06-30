CREATE TYPE public.takedown_status AS ENUM (
  'not_started','evidence_missing','ready','preparing_form','waiting_approval',
  'submitted','platform_reviewing','removed','rejected','counter_notice','escalated_legal'
);

CREATE TYPE public.takedown_type AS ENUM (
  'youtube_copyright','youtube_privacy','youtube_impersonation',
  'instagram_copyright','facebook_copyright','tiktok_copyright',
  'website_dmca','hosting_abuse','google_delisting'
);

CREATE TABLE public.takedown_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_id uuid REFERENCES public.enforcement_cases(id) ON DELETE SET NULL,
  match_id uuid REFERENCES public.discovered_matches(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  certificate_id uuid REFERENCES public.certificates(id) ON DELETE SET NULL,
  platform text NOT NULL,
  takedown_type public.takedown_type NOT NULL,
  status public.takedown_status NOT NULL DEFAULT 'not_started',
  rights_owner_name text,
  rights_owner_email text,
  original_url text,
  infringing_url text NOT NULL,
  violation_description text,
  similarity_score numeric,
  matched_at timestamptz,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_url text,
  form_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_declaration text,
  risk_warnings text,
  assigned_manager text,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  warning_email_id uuid REFERENCES public.warning_emails(id) ON DELETE SET NULL,
  warning_sent_at timestamptz,
  response_deadline timestamptz,
  approved_at timestamptz,
  approved_by text,
  submitted_at timestamptz,
  confirmation_screenshot_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.takedown_cases TO authenticated;
GRANT ALL ON public.takedown_cases TO service_role;

ALTER TABLE public.takedown_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages takedowns" ON public.takedown_cases
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_takedown_updated BEFORE UPDATE ON public.takedown_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_takedown_user ON public.takedown_cases(user_id, status);