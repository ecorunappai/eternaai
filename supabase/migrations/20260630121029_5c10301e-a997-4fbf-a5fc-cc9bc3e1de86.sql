
-- 1. Certificates: restrict authenticated SELECT to owner
DROP POLICY IF EXISTS "certs auth read" ON public.certificates;
DROP POLICY IF EXISTS "certs public verify" ON public.certificates;

CREATE POLICY "certs owner read" ON public.certificates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Public verification via SECURITY DEFINER function (safe column subset)
CREATE OR REPLACE FUNCTION public.verify_certificate(_cert_number text)
RETURNS TABLE (
  certificate_number text,
  owner_name text,
  issued_at timestamptz,
  asset_title text,
  asset_type text,
  asset_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.certificate_number, c.owner_name, c.issued_at,
         a.title, a.asset_type, a.sha256
  FROM public.certificates c
  LEFT JOIN public.assets a ON a.id = c.asset_id
  WHERE c.certificate_number = _cert_number
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

-- 3. Storage UPDATE policies for assets + evidence (owner folder = auth.uid())
CREATE POLICY "assets owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'assets' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "evidence owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'evidence' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'evidence' AND (auth.uid())::text = (storage.foldername(name))[1]);
