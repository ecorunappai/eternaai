
CREATE TABLE public.enforcement_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.discovered_matches(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  subject_name TEXT,
  target_url TEXT NOT NULL,
  channel_url TEXT,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  risk_level TEXT,
  page_title TEXT,
  page_description TEXT,
  screenshot_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enforcement_cases TO authenticated;
GRANT ALL ON public.enforcement_cases TO service_role;
ALTER TABLE public.enforcement_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cases" ON public.enforcement_cases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.case_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.enforcement_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  source_url TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_evidence TO authenticated;
GRANT ALL ON public.case_evidence TO service_role;
ALTER TABLE public.case_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evidence" ON public.case_evidence FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.creator_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.enforcement_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL DEFAULT 'email',
  value TEXT NOT NULL,
  source_url TEXT,
  source_label TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_contacts TO authenticated;
GRANT ALL ON public.creator_contacts TO service_role;
ALTER TABLE public.creator_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contacts" ON public.creator_contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.warning_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.enforcement_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  deadline_hours INT NOT NULL DEFAULT 72,
  status TEXT NOT NULL DEFAULT 'draft',
  risk_level TEXT,
  fair_use_flag TEXT,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warning_emails TO authenticated;
GRANT ALL ON public.warning_emails TO service_role;
ALTER TABLE public.warning_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own emails" ON public.warning_emails FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_cases_user ON public.enforcement_cases(user_id, created_at DESC);
CREATE INDEX idx_evidence_case ON public.case_evidence(case_id);
CREATE INDEX idx_contacts_case ON public.creator_contacts(case_id);
CREATE INDEX idx_emails_case ON public.warning_emails(case_id);
