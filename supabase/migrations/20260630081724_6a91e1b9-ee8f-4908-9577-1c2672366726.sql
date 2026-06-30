
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + default user role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Assets (content registry)
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image','video','audio','document','text')),
  storage_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  sha256 TEXT,
  phash TEXT,
  status TEXT NOT NULL DEFAULT 'protected' CHECK (status IN ('protected','pending','archived')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets owner all" ON public.assets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Certificates (publicly verifiable)
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.certificates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certs public verify" ON public.certificates FOR SELECT TO anon USING (true);
CREATE POLICY "certs auth read" ON public.certificates FOR SELECT TO authenticated USING (true);
CREATE POLICY "certs owner write" ON public.certificates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "certs owner delete" ON public.certificates FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Identities (social handles / domains)
CREATE TABLE public.identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  url TEXT,
  verification_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.identities TO authenticated;
GRANT ALL ON public.identities TO service_role;
ALTER TABLE public.identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "identities owner all" ON public.identities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Violations
CREATE TABLE public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  infringing_url TEXT NOT NULL,
  similarity_score NUMERIC(5,2),
  threat_level TEXT NOT NULL DEFAULT 'medium' CHECK (threat_level IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','enforcement_sent','resolved','dismissed')),
  evidence_url TEXT,
  notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.violations TO authenticated;
GRANT ALL ON public.violations TO service_role;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "violations owner all" ON public.violations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv owner all" ON public.conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg owner all" ON public.messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX ON public.assets (user_id, created_at DESC);
CREATE INDEX ON public.violations (user_id, detected_at DESC);
CREATE INDEX ON public.identities (user_id);
CREATE INDEX ON public.messages (conversation_id, created_at);
