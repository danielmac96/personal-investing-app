# Architecture

Everything runs locally on one machine. State is a single SQLite file.

```
┌──────────────────────┐         ┌──────────────────────┐
│  Claude Code routine │         │  Schwab CSV (manual) │
│  (weekday mornings — │         │                      │
│  cron or /daily-brief)│        │  uploaded via /upload│
│                      │         │                      │
│  yfinance ──► pandas │         └──────────┬───────────┘
│  indicators ──► sub‑ │                    │
│  agents ──► briefing │                    ▼
└──────────┬───────────┘          ┌──────────────────────┐
           │ one SQLite           │  Next.js App Router  │
           │ transaction          │  (pnpm dev / start,  │
           ▼                      │  localhost only)     │
   ┌──────────────────────────────┴───────┐              │
   │      data/investing.db (SQLite)      │◄─ reads +    │
   │  prices_eod, fundamentals_snapshot,  │   user writes┘
   │  news_items, earnings_events,        │   (better-sqlite3)
   │  daily_briefings, recommendations,   │
   │  holdings, watchlist, theses,        │
   │  cash_position, watchlist_proposals, │
   │  routine_runs                        │
   └──────────────────────────────────────┘
                       │
                       ▼
               ┌──────────────┐
               │   Resend     │ < 200-word summary email
               └──────────────┘
```

Schema: `db/schema.sql` — idempotent, applied automatically on every
connection open by both the web app (`web/lib/db.ts`) and the routine
(`routine/scripts/common.py`). No migration tooling needed; edit the
schema additively.

## Boundary rules

- **App never calls Anthropic, never calls yfinance.** Pure read of the
  local DB + thin user-write paths (CSV import, watchlist, theses).
- **Routine never serves HTTP.** It runs, writes, emails, exits.
- **The routine owns analytical tables** (prices, fundamentals, news,
  earnings, briefings, recommendations, proposals, runs); the app owns
  user tables (holdings, watchlist, theses, cash). Both sides honour
  that split by convention — there's no second user to defend against.
- **No auth.** The app binds to localhost for a single user. Don't
  expose the port publicly; if remote access is ever needed, put it
  behind a VPN/tailnet rather than re-adding a login.

## Concurrency

SQLite runs in WAL mode, so the dashboard can read while the morning
briefing writes. The briefing is one transaction — readers see the old
briefing or the new one, never a half-written day.
