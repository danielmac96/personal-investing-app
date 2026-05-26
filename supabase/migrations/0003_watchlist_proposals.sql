-- =============================================================================
-- watchlist_proposals: candidates surfaced by the weekly growth screen.
-- The routine (service_role) inserts pending proposals; the user reviews them
-- on the dashboard and either approves (→ inserts into watchlist) or dismisses.
-- =============================================================================

create table public.watchlist_proposals (
  id              bigserial primary key,
  symbol          text not null,
  proposed_date   date not null,
  screen_metrics  jsonb,
  confidence      integer check (confidence between 1 and 10),
  reasoning       text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'dismissed')),
  created_at      timestamptz not null default now(),
  unique (symbol, proposed_date)
);

create index watchlist_proposals_status_date
  on public.watchlist_proposals (status, proposed_date desc);

alter table public.watchlist_proposals enable row level security;

-- User can read proposals and update their status / delete them, but cannot
-- insert (proposals only come from the weekly screen via service_role).
create policy watchlist_proposals_app_user_select on public.watchlist_proposals
  for select to authenticated using (public.is_app_user());

create policy watchlist_proposals_app_user_update on public.watchlist_proposals
  for update to authenticated
  using (public.is_app_user())
  with check (public.is_app_user());

create policy watchlist_proposals_app_user_delete on public.watchlist_proposals
  for delete to authenticated using (public.is_app_user());

-- ---------------------------------------------------------------------------
-- apply_screen_proposals: atomic replace of a given day's pending proposals.
-- Mirrors apply_briefing — service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.apply_screen_proposals(
  _proposed_date date,
  _proposals jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _proposals is null or jsonb_typeof(_proposals) <> 'array' then
    raise exception '_proposals must be a JSON array';
  end if;

  -- Replace only still-pending rows for this date; never clobber a proposal
  -- the user already approved or dismissed.
  delete from public.watchlist_proposals
   where proposed_date = _proposed_date and status = 'pending';

  insert into public.watchlist_proposals
    (symbol, proposed_date, screen_metrics, confidence, reasoning, status)
  select
    (p->>'symbol')::text,
    _proposed_date,
    p->'screen_metrics',
    (p->>'confidence')::integer,
    p->>'reasoning',
    'pending'
  from jsonb_array_elements(_proposals) p
  on conflict (symbol, proposed_date) do update
    set screen_metrics = excluded.screen_metrics,
        confidence     = excluded.confidence,
        reasoning      = excluded.reasoning
    where public.watchlist_proposals.status = 'pending';
end;
$$;

revoke all on function public.apply_screen_proposals(date, jsonb) from public;
revoke all on function public.apply_screen_proposals(date, jsonb) from anon;
revoke all on function public.apply_screen_proposals(date, jsonb) from authenticated;
grant execute on function public.apply_screen_proposals(date, jsonb) to service_role;
