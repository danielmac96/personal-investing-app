# Supabase

Schema lives in `migrations/`. The Supabase project for this app:

| Field | Value |
| ----- | ----- |
| Project name | `personal-investing-app` |
| Project ref | `mmufhnhqpjrjxaghwdiq` |
| Region | `us-east-1` |
| URL | `https://mmufhnhqpjrjxaghwdiq.supabase.co` |

## Applying migrations

Migrations were applied via the Supabase MCP server during initial setup.
To re-apply locally with the Supabase CLI:

```bash
supabase link --project-ref mmufhnhqpjrjxaghwdiq
supabase db push
```

Or paste `migrations/0001_init.sql` into the SQL editor in the Supabase
dashboard for a one-off run.

## RLS model

Single-user app. Access is gated by the `public.is_app_user()` function, which
checks `auth.email() = 'danielmac96@gmail.com'`.

- **User-writable tables** (`holdings`, `watchlist`, `theses`, `cash_position`):
  full CRUD for the allow-listed user.
- **Routine-written tables** (`prices_eod`, `fundamentals_snapshot`,
  `news_items`, `earnings_events`, `daily_briefings`, `recommendations`):
  SELECT-only for the user. Writes use the `service_role` key (which bypasses
  RLS) from inside the daily routine.

To add a second user, extend `is_app_user()` — every policy already routes
through it.

## RPC functions

- `apply_briefing(_briefing_date, _portfolio_summary, _raw_payload, _recommendations)`
  — atomically replaces `daily_briefings` + `recommendations` for a given
  date. SECURITY DEFINER, granted to `service_role` only. Used by
  `routine/scripts/write_briefing.py`.
- `apply_screen_proposals(_proposed_date, _proposals)` — atomically
  replaces still-pending `watchlist_proposals` for a date (never clobbers
  approved/dismissed ones). SECURITY DEFINER, `service_role` only. Used by
  `routine/scripts/write_proposals.py`.

## watchlist_proposals (0003)

Weekly-screen candidates. The user can SELECT / UPDATE (approve/dismiss) /
DELETE; only `service_role` inserts. Approving a proposal upserts the
symbol into `watchlist` and flips the proposal's status — handled by the
`/watchlist` server actions.
