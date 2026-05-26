-- =============================================================================
-- apply_briefing: atomic writer for the user-visible "today's view".
--
-- prices_eod / fundamentals_snapshot / news_items / earnings_events are
-- upserted incrementally by the routine via the standard supabase-py client;
-- partial failures there are recoverable. But daily_briefings +
-- recommendations together define what the dashboard shows for "today" — they
-- must be replaced atomically so the briefing date and its per-symbol
-- recommendations are never out of sync.
--
-- The function is SECURITY DEFINER so it runs with the table owner's
-- privileges (RLS still applies — service_role bypasses RLS, so it's fine).
-- EXECUTE is granted to service_role only; revoked from public.
-- =============================================================================

create or replace function public.apply_briefing(
  _briefing_date date,
  _portfolio_summary jsonb,
  _raw_payload jsonb,
  _recommendations jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _recommendations is null or jsonb_typeof(_recommendations) <> 'array' then
    raise exception '_recommendations must be a JSON array';
  end if;

  -- Idempotent: a re-run on the same briefing_date fully replaces prior
  -- contents instead of duplicating recommendations.
  delete from public.recommendations where briefing_date = _briefing_date;
  delete from public.daily_briefings where briefing_date = _briefing_date;

  insert into public.daily_briefings
    (briefing_date, portfolio_summary, raw_payload)
  values
    (_briefing_date, _portfolio_summary, _raw_payload);

  insert into public.recommendations
    (briefing_date, symbol, signal, confidence, reasoning,
     watch_items, thesis_status, indicator_snapshot)
  select
    _briefing_date,
    (r->>'symbol')::text,
    (r->>'signal')::text,
    (r->>'confidence')::integer,
    (r->>'reasoning')::text,
    r->'watch_items',
    nullif(r->>'thesis_status', ''),
    r->'indicator_snapshot'
  from jsonb_array_elements(_recommendations) r;
end;
$$;

revoke all on function public.apply_briefing(date, jsonb, jsonb, jsonb) from public;
revoke all on function public.apply_briefing(date, jsonb, jsonb, jsonb) from anon;
revoke all on function public.apply_briefing(date, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.apply_briefing(date, jsonb, jsonb, jsonb) to service_role;
