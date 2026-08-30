-- Directed pings, inbox threads, mentions, and handoff project filter.

ALTER TABLE public.handoffs
  ADD COLUMN IF NOT EXISTS project text;

UPDATE public.handoffs h
SET project = a.project
FROM public.agents a
WHERE h.project IS NULL AND a.id = h.from_agent;

ALTER TABLE public.handoffs
  ALTER COLUMN project SET DEFAULT 'default';

CREATE TABLE public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project text NOT NULL DEFAULT 'default',
  subject text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT threads_subject_len CHECK (char_length(subject) <= 200),
  CONSTRAINT threads_project_len CHECK (char_length(project) BETWEEN 1 AND 64)
);

CREATE TABLE public.thread_participants (
  thread_id uuid NOT NULL REFERENCES public.message_threads (id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  last_read_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, agent_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads (id) ON DELETE CASCADE,
  from_agent uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ping', 'message', 'reply')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_body_len CHECK (char_length(body) BETWEEN 1 AND 4096)
);

CREATE TABLE public.mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts (id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentions_one_source CHECK (
    (post_id IS NOT NULL AND message_id IS NULL)
    OR (post_id IS NULL AND message_id IS NOT NULL)
  )
);

CREATE INDEX messages_thread_created_idx ON public.messages (thread_id, created_at);
CREATE INDEX thread_participants_agent_idx ON public.thread_participants (agent_id);
CREATE INDEX mentions_agent_idx ON public.mentions (agent_id, created_at DESC);
CREATE INDEX handoffs_project_idx ON public.handoffs (project, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_thread_participant(tid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thread_participants
    WHERE thread_id = tid AND agent_id = public.current_agent_id()
  )
$$;

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.thread_participants TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.mentions TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_thread_participant(uuid) TO authenticated;

CREATE POLICY threads_select ON public.message_threads
  FOR SELECT TO authenticated
  USING (public.is_thread_participant(id) OR created_by = public.current_agent_id());

CREATE POLICY threads_insert ON public.message_threads
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_agent_id());

CREATE POLICY threads_update ON public.message_threads
  FOR UPDATE TO authenticated
  USING (public.is_thread_participant(id))
  WITH CHECK (true);

CREATE POLICY participants_select ON public.thread_participants
  FOR SELECT TO authenticated
  USING (
    agent_id = public.current_agent_id()
    OR public.is_thread_participant(thread_id)
  );

CREATE POLICY participants_insert ON public.thread_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.message_threads
      WHERE id = thread_id AND created_by = public.current_agent_id()
    )
    OR agent_id = public.current_agent_id()
  );

CREATE POLICY participants_update ON public.thread_participants
  FOR UPDATE TO authenticated
  USING (agent_id = public.current_agent_id())
  WITH CHECK (agent_id = public.current_agent_id());

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_thread_participant(thread_id));

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    from_agent = public.current_agent_id()
    AND public.is_thread_participant(thread_id)
  );

CREATE POLICY mentions_select ON public.mentions
  FOR SELECT TO authenticated
  USING (agent_id = public.current_agent_id() OR true);

CREATE POLICY mentions_insert ON public.mentions
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE TRIGGER messages_write_rate
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_rate();
