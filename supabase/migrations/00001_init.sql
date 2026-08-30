-- Coordination hub schema. Applies on hosted Supabase and on local PGlite.
-- PGlite adapter installs auth.uid() + roles before this file runs.

CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE NOT NULL,
  handle text UNIQUE NOT NULL,
  machine_label text NOT NULL,
  project text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'working', 'blocked')),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agents_handle_format CHECK (handle ~ '^[a-z][a-z0-9_-]{1,31}$'),
  CONSTRAINT agents_machine_len CHECK (char_length(machine_label) BETWEEN 1 AND 64),
  CONSTRAINT agents_project_len CHECK (char_length(project) BETWEEN 1 AND 64)
);

CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  project text NOT NULL,
  type text NOT NULL CHECK (type IN ('status', 'completed', 'blocked', 'handoff')),
  body text NOT NULL,
  related_files text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_body_len CHECK (char_length(body) BETWEEN 1 AND 4096),
  CONSTRAINT posts_project_len CHECK (char_length(project) BETWEEN 1 AND 64),
  CONSTRAINT posts_files_len CHECK (cardinality(related_files) <= 32)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  claimed_by uuid REFERENCES public.agents (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT tasks_description_len CHECK (char_length(description) <= 4096),
  CONSTRAINT tasks_project_len CHECK (char_length(project) BETWEEN 1 AND 64),
  CONSTRAINT tasks_claim_status CHECK (
    (status = 'open' AND claimed_by IS NULL)
    OR (status IN ('claimed', 'done') AND claimed_by IS NOT NULL)
  )
);

CREATE TABLE public.file_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project text NOT NULL,
  file_path text NOT NULL,
  held_by uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  CONSTRAINT leases_path_len CHECK (char_length(file_path) BETWEEN 1 AND 1024),
  CONSTRAINT leases_project_len CHECK (char_length(project) BETWEEN 1 AND 64)
);

-- Active lease uniqueness. Expiry must SET released_at so the path frees.
CREATE UNIQUE INDEX file_leases_active_unique
  ON public.file_leases (project, file_path)
  WHERE released_at IS NULL;

CREATE TABLE public.handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  to_agent uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  context_summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handoffs_context_len CHECK (char_length(context_summary) BETWEEN 1 AND 4096)
);

-- Local / PGlite token table. Hosted Supabase uses Auth JWTs instead.
-- Authenticated clients have no grants on this table.
CREATE TABLE public.agent_tokens (
  auth_id uuid PRIMARY KEY REFERENCES public.agents (auth_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX posts_project_idx ON public.posts (project, created_at DESC);
CREATE INDEX tasks_project_status_idx ON public.tasks (project, status);
CREATE INDEX leases_holder_idx ON public.file_leases (held_by)
  WHERE released_at IS NULL;
CREATE INDEX handoffs_to_agent_idx ON public.handoffs (to_agent, created_at DESC);
CREATE INDEX rate_limit_auth_created_idx
  ON public.rate_limit_events (auth_id, created_at DESC);
CREATE INDEX agents_project_idx ON public.agents (project);

CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.agents WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.touch_task_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_touch_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_task_updated_at();

CREATE OR REPLACE FUNCTION public.expire_stale_leases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.file_leases
  SET released_at = now()
  WHERE released_at IS NULL
    AND expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_write_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.rate_limit_events
  WHERE created_at < now() - interval '1 hour';

  SELECT count(*) INTO n
  FROM public.rate_limit_events
  WHERE auth_id = uid
    AND created_at > now() - interval '1 minute';

  IF n >= 30 THEN
    RAISE EXCEPTION 'rate_limit: too many writes in the last minute'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_events (auth_id) VALUES (uid);
  RETURN NEW;
END;
$$;

CREATE TRIGGER posts_write_rate
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_rate();

CREATE TRIGGER tasks_write_rate
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_rate();

CREATE TRIGGER leases_write_rate
  BEFORE INSERT ON public.file_leases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_rate();

CREATE TRIGGER handoffs_write_rate
  BEFORE INSERT ON public.handoffs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_rate();

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;
-- Internal table used only by enforce_write_rate(); keep RLS off so the
-- SECURITY DEFINER trigger can always count and insert.
ALTER TABLE public.rate_limit_events DISABLE ROW LEVEL SECURITY;

-- Privileges for the authenticated role (created by Supabase or PGlite bootstrap).
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agents TO authenticated;
GRANT SELECT, INSERT ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.file_leases TO authenticated;
GRANT SELECT, INSERT ON public.handoffs TO authenticated;
REVOKE ALL ON public.rate_limit_events FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_agent_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_leases() TO authenticated;

REVOKE ALL ON public.agent_tokens FROM authenticated, anon;
REVOKE ALL ON public.agent_tokens FROM PUBLIC;

CREATE POLICY agents_select ON public.agents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY agents_insert ON public.agents
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY agents_update ON public.agents
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY posts_select ON public.posts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY posts_insert ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = public.current_agent_id());

CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Holder or unclaimed row may be updated. WITH CHECK is open so a holder
-- can transfer claimed_by to another agent during a handoff.
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    claimed_by IS NULL
    OR claimed_by = public.current_agent_id()
  )
  WITH CHECK (true);

CREATE POLICY leases_select ON public.file_leases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY leases_insert ON public.file_leases
  FOR INSERT TO authenticated
  WITH CHECK (held_by = public.current_agent_id());

CREATE POLICY leases_update ON public.file_leases
  FOR UPDATE TO authenticated
  USING (held_by = public.current_agent_id())
  WITH CHECK (held_by = public.current_agent_id());

CREATE POLICY handoffs_select ON public.handoffs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY handoffs_insert ON public.handoffs
  FOR INSERT TO authenticated
  WITH CHECK (from_agent = public.current_agent_id());

-- Tokens and raw rate-limit rows stay invisible to clients.
CREATE POLICY tokens_deny ON public.agent_tokens
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
