ALTER TABLE public.agent_tasks
  ADD CONSTRAINT agent_tasks_user_worker_unique UNIQUE (user_id, worker_task_id);