-- =============================================================================
-- Personal Investing App — initial schema
-- Single-user app: only danielmac96@gmail.com can read; service_role writes
-- analytical data; the user writes holdings/watchlist/theses/cash directly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: is the caller the allow-listed user?
-- Centralised so we can extend the allow-list later by editing one function.
-- ---------------------------------------------------------------------------
create or replace function public.is_app_user()
returns boolean
language sql
stable
as $$
  select coalesce(auth.email() = 'danielmac96@gmail.com', false);
$$;

-- ---------------------------------------------------------------------------
-- User-writable tables
-- ---------------------------------------------------------------------------

create table public.holdings (
  symbol                  text primary key,
  qty                     numeric(20, 8) not null check (qty >= 0),
  cost_basis_per_share    numeric(20, 8),
  notes                   text,
  updated_at              timestamptz not null default now()
);

create trigger holdings_set_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

create table public.watchlist (
  symbol        text primary key,
  added_at      timestamptz not null default now(),
  notes         text,
  updated_at    timestamptz not null default now()
);

create trigger watchlist_set_updated_at
  before update on public.watchlist
  for each row execute function public.set_updated_at();

create table public.theses (
  symbol        text primary key,
  thesis_text   text not null,
  updated_at    timestamptz not null default now()
);

create trigger theses_set_updated_at
  before update on public.theses
  for each row execute function public.set_updated_at();

create table public.cash_position (
  id            integer primary key default 1,
  amount        numeric(20, 2) not null default 0,
  updated_at    timestamptz not null default now(),
  constraint cash_position_singleton check (id = 1)
);

create trigger cash_position_set_updated_at
  before update on public.cash_position
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Routine-written tables (service_role only)
-- ---------------------------------------------------------------------------

create table public.prices_eod (
  symbol      text not null,
  date        date not null,
  open        numeric(20, 6),
  high        numeric(20, 6),
  low         numeric(20, 6),
  close       numeric(20, 6) not null,
  volume      bigint,
  primary key (symbol, date)
);

create index prices_eod_symbol_date_desc
  on public.prices_eod (symbol, date desc);

create table public.fundamentals_snapshot (
  symbol          text not null,
  snapshot_date   date not null,
  data            jsonb not null,
  primary key (symbol, snapshot_date)
);

create index fundamentals_snapshot_symbol_date_desc
  on public.fundamentals_snapshot (symbol, snapshot_date desc);

create table public.news_items (
  id              bigserial primary key,
  symbol          text not null,
  headline        text not null,
  url             text,
  published_at    timestamptz not null,
  sentiment       text,
  source          text,
  unique (symbol, url, published_at)
);

create index news_items_symbol_published_desc
  on public.news_items (symbol, published_at desc);

create table public.earnings_events (
  symbol          text not null,
  report_date     date not null,
  eps_estimate    numeric(20, 6),
  eps_actual      numeric(20, 6),
  surprise_pct    numeric(20, 6),
  primary key (symbol, report_date)
);

create index earnings_events_symbol_date
  on public.earnings_events (symbol, report_date);

create table public.daily_briefings (
  briefing_date       date primary key,
  portfolio_summary   jsonb not null,
  raw_payload         jsonb,
  created_at          timestamptz not null default now()
);

create table public.recommendations (
  briefing_date         date not null,
  symbol                text not null,
  signal                text not null,
  confidence            integer not null check (confidence between 1 and 10),
  reasoning             text not null,
  watch_items           jsonb,
  thesis_status         text,
  indicator_snapshot    jsonb,
  primary key (briefing_date, symbol)
);

create index recommendations_symbol_date_desc
  on public.recommendations (symbol, briefing_date desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- service_role bypasses RLS by default, so policies below define user access.
-- ---------------------------------------------------------------------------

alter table public.holdings              enable row level security;
alter table public.watchlist             enable row level security;
alter table public.theses                enable row level security;
alter table public.cash_position         enable row level security;
alter table public.prices_eod            enable row level security;
alter table public.fundamentals_snapshot enable row level security;
alter table public.news_items            enable row level security;
alter table public.earnings_events       enable row level security;
alter table public.daily_briefings       enable row level security;
alter table public.recommendations       enable row level security;

-- User-writable tables: full CRUD for the allow-listed user
create policy holdings_app_user_all on public.holdings
  for all
  to authenticated
  using (public.is_app_user())
  with check (public.is_app_user());

create policy watchlist_app_user_all on public.watchlist
  for all
  to authenticated
  using (public.is_app_user())
  with check (public.is_app_user());

create policy theses_app_user_all on public.theses
  for all
  to authenticated
  using (public.is_app_user())
  with check (public.is_app_user());

create policy cash_position_app_user_all on public.cash_position
  for all
  to authenticated
  using (public.is_app_user())
  with check (public.is_app_user());

-- Routine-written tables: read-only for the allow-listed user
create policy prices_eod_app_user_select on public.prices_eod
  for select to authenticated using (public.is_app_user());

create policy fundamentals_snapshot_app_user_select on public.fundamentals_snapshot
  for select to authenticated using (public.is_app_user());

create policy news_items_app_user_select on public.news_items
  for select to authenticated using (public.is_app_user());

create policy earnings_events_app_user_select on public.earnings_events
  for select to authenticated using (public.is_app_user());

create policy daily_briefings_app_user_select on public.daily_briefings
  for select to authenticated using (public.is_app_user());

create policy recommendations_app_user_select on public.recommendations
  for select to authenticated using (public.is_app_user());
