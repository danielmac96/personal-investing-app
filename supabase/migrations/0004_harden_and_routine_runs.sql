-- =============================================================================
-- Phase 5 hardening
--   1. Pin search_path on the two early functions (advisor WARN
--      function_search_path_mutable). The later RPCs already set it.
--   2. routine_runs: a log row per routine execution so failed runs and
--      undelivered emails are visible.
-- =============================================================================

-- 1. Pin search_path -------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_app_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.email() = 'danielmac96@gmail.com', false);
$$;

-- 2. routine_runs ----------------------------------------------------------

create table public.routine_runs (
  id            bigserial primary key,
  run_type      text not null,        -- 'daily_briefing' | 'weekly_screen'
  run_date      date not null,
  status        text not null,        -- 'success' | 'partial' | 'failed'
  email_status  text,                 -- 'sent' | 'failed' | 'skipped' | null
  summary       jsonb,
  error         text,
  created_at    timestamptz not null default now()
);

create index routine_runs_created_desc on public.routine_runs (created_at desc);

alter table public.routine_runs enable row level security;

-- Read-only for the user; service_role (bypasses RLS) writes from the routine.
create policy routine_runs_app_user_select on public.routine_runs
  for select to authenticated using (public.is_app_user());
