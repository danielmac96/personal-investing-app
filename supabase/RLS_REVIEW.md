# RLS Policy Review (Phase 5)

Audited 2026-05. Supabase security advisors return **zero findings** after
migration 0004.

## Model

Single-user app. The only principal that should ever read data is the
allow-listed user (`danielmac96@gmail.com`). All access flows through
`public.is_app_user()` — `auth.email() = '<allow-listed email>'`, now with a
pinned empty `search_path`.

- **`anon` / public**: no policies anywhere → no access. (RLS denies by
  default once enabled.)
- **`authenticated`**: only the allow-listed email passes `is_app_user()`.
  A logged-in account with any other email sees nothing (and the app
  middleware signs them out).
- **`service_role`**: bypasses RLS by design. Only the daily/weekly routine
  holds this key, injected as an env var in the cloud environment — never
  shipped to the browser.

## Per-table policies

| Table | RLS | User access | Writer |
| ----- | --- | ----------- | ------ |
| holdings | ✅ | ALL (CRUD) | user |
| watchlist | ✅ | ALL (CRUD) | user |
| theses | ✅ | ALL (CRUD) | user |
| cash_position | ✅ | ALL (CRUD) | user |
| prices_eod | ✅ | SELECT | routine (service_role) |
| fundamentals_snapshot | ✅ | SELECT | routine |
| news_items | ✅ | SELECT | routine |
| earnings_events | ✅ | SELECT | routine |
| daily_briefings | ✅ | SELECT | routine (via `apply_briefing`) |
| recommendations | ✅ | SELECT | routine (via `apply_briefing`) |
| watchlist_proposals | ✅ | SELECT / UPDATE / DELETE | routine inserts (via `apply_screen_proposals`); user approves/dismisses |
| routine_runs | ✅ | SELECT | routine |

`watchlist_proposals` deliberately has **no INSERT policy for
`authenticated`** — proposals can only originate from the weekly screen.
Approving a proposal upserts into `watchlist` (user-writable) and flips the
proposal status via UPDATE.

## Functions (all `SECURITY DEFINER` or trigger; pinned search_path)

| Function | search_path | Execute granted to |
| -------- | ----------- | ------------------ |
| `set_updated_at` (trigger) | `''` | n/a |
| `is_app_user` | `''` | n/a (called in policies) |
| `apply_briefing` | `public` | `service_role` only |
| `apply_screen_proposals` | `public` | `service_role` only |

The two `apply_*` RPCs have EXECUTE revoked from `public`, `anon`, and
`authenticated`. A browser session cannot call them; only the routine can.

## Things confirmed NOT present

- No table is missing RLS.
- No policy uses `using (true)` / public read.
- No `anon`-granted policy.
- The `service_role` key is not referenced in any `web/` client-side code
  (only `web/lib/supabase/admin.ts`, which is `import "server-only"` and
  unused in Phase 1–4 request paths).
