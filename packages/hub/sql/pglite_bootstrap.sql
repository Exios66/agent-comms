CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- PGlite has no pgcrypto WASM module we can safely load through Next.js.
-- This is a local stand-in; hosted Supabase already provides gen_random_uuid().
CREATE OR REPLACE FUNCTION public.gen_random_uuid()
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT uuid_in(
    overlay(
      overlay(md5(random()::text || clock_timestamp()::text) placing '4' from 13)
      placing 'a' from 17
    )::cstring
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

GRANT authenticated TO CURRENT_USER;
GRANT anon TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
